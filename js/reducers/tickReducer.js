// @flow

const {
  fadeAllPheromones, computeAllPheromoneSteadyState,
  setPheromone, fillPheromone, clearPheromone,
  refreshPheromones,
} = require('../simulation/pheromones');
const {
  lookupInGrid, getEntityPositions,
  entityInsideGrid,
} = require('../utils/gridHelpers');
const {
  makeAction, isActionTypeQueued, getDuration,
  queueAction, stackAction, cancelAction,
} = require('../simulation/actionQueue.js');
const {
  removeEntity, addEntity, changeEntityType, moveEntity,
  addSegmentToEntity, changePheromoneEmitterQuantity,
} = require('../simulation/entityOperations');
const {render} = require('../render/render');
const {
  getPosBehind, getPositionsInFront, onScreen,
} = require('../selectors/misc');
const {oneOf} = require('../utils/stochastic');
const {collides, collidesWith} = require('../selectors/collisions');
const {
  add, equals, subtract, magnitude, scale,
  makeVector, vectorTheta, floor, round,
  abs, dist, clampMagnitude,
} = require('../utils/vectors');
const {
  clamp, closeTo, encodePosition, decodePosition,
} = require('../utils/helpers');
const {getInterpolatedIndex, getDictIndexStr} = require('../selectors/sprites');
const {
  entityStartCurrentAction,
} = require('../simulation/actionOperations');
const {agentDecideAction} = require('../simulation/agentOperations');
const {getFreeNeighborPositions, areNeighbors} = require('../selectors/neighbors');
const {
  getPheromoneAtPosition, getTemperature,
} = require('../selectors/pheromones');
const globalConfig = require('../config');
const {dealDamageToEntity} = require('../simulation/miscOperations');
const {Entities} = require('../entities/registry');
const {canAffordBuilding} = require('../selectors/buildings');

import type {
  Game, Entity, Action, Ant,
} from '../types';

let totalTime = 0;
const tickReducer = (game: Game, action: Action): GameState => {
  switch (action.type) {
    case 'START_TICK': {
      if (game != null && game.tickInterval != null) {
        return game;
      }

      game.prevTickTime = new Date().getTime();

      return {
        ...game,
        tickInterval: setInterval(
          // HACK: store is only available via window
          () => store.dispatch({type: 'TICK'}),
          globalConfig.config.msPerTick,
        ),
      };
    }
    case 'STOP_TICK': {
      clearInterval(game.tickInterval);
      game.tickInterval = null;

      return game;
    }
    case 'TICK': {
      return doTick(game);
    }
  }
  return game;
};

//////////////////////////////////////////////////////////////////////////
// Do Tick
//////////////////////////////////////////////////////////////////////////
const doTick = (game: Game): Game => {
  const curTickTime = new Date().getTime();

	game.time += 1;

  // initializations:
  if (game.time == 1) {
    game.prevTickTime = new Date().getTime();
    game.viewImage.allStale = true;
    computeAllPheromoneSteadyState(game);
    game.pheromoneWorker.postMessage({
      type: 'INIT',
      grid: game.grid,
      entities: game.entities,
      PHEROMONE_EMITTER: game.PHEROMONE_EMITTER || {},
    });
  }

  // game/frame timing
  game.timeSinceLastTick = curTickTime - game.prevTickTime;

  // these are the ECS "systems"
  updateJets(game);
  updateActors(game);
  updateAgents(game);
  updateTiledSprites(game);
  updateViewPos(game, false /*don't clamp to world*/);
  updateTicker(game);
  updatePheromoneEmitters(game);
  updateTowers(game);
  updateBallistics(game);
  updateFlammables(game);
  updateExplosives(game);

  // updatePheromones(game);
  render(game);

  // update timing frames
  game.totalGameTime += curTickTime - game.prevTickTime;
  game.prevTickTime = curTickTime;

  return game;
};

//////////////////////////////////////////////////////////////////////////
// Updating Jets
//////////////////////////////////////////////////////////////////////////

const updateJets = (game): void => {
  // console.log("_________");
  for (const id in game.JET) {
    const jet = game.entities[id];
    const config = Entities[jet.type].config;

    // controlled jet
    const flipMult = jet.flipped ? -1 : 1;
    if (game.controlledEntity && game.controlledEntity.id == jet.id) {
      if (game.hotKeys.keysDown.up) {
        jet.theta += flipMult * jet.pitchRate;
      }
      if (game.hotKeys.keysDown.down) {
        jet.theta -= flipMult * jet.pitchRate;
      }
      if (game.hotKeys.keysDown.left) {
        jet.thrust = clamp(jet.thrust - flipMult * jet.thrustRate, 0, jet.maxThrust);
      }
      if (game.hotKeys.keysDown.right) {
        jet.thrust = clamp(jet.thrust + flipMult * jet.thrustRate, 0, jet.maxThrust);
      }
    }

    // enemy jets
    if (jet.playerID == 2 && game.controlledEntity != null) {
      const target = game.controlledEntity;
      const targetPos = target.position;
      const targetTheta = vectorTheta(subtract(targetPos, jet.position)) % (Math.PI / 2);
      if (
        (targetTheta > jet.theta && targetTheta - jet.theta < Math.PI)
        // || (targetTheta < jet.theta && jet.theta - targetTheta > Math.PI)
      ) {
        jet.theta += jet.pitchRate;
      } else {
        jet.theta -= jet.pitchRate;
      }
    }

    jet.theta = (jet.theta + 2 * Math.PI) % (2 * Math.PI);
    // console.log(jet.theta.toFixed(2));

    // handle aerodynamic forces
    const speed = magnitude(jet.velocity);
    const drag = 0.5 * jet.dragCoefficient * speed * speed;
    const lift = 0.5 * jet.liftCoefficient * speed * speed * Math.abs(Math.cos(jet.theta));
    const dragVec = makeVector(jet.theta, -1 * drag);
    // dragVec.y *= -1;
    // const liftVec = {x: 0, y: -1 * lift};
    const liftVec = makeVector(jet.theta + Math.PI / 2, lift);
    const thrustVec = makeVector(jet.theta, -1 * jet.thrust);
    const weightVec = {x: 0, y: jet.mass};

    // combine into jet acceleration and speed
    const accel = scale(add(dragVec, liftVec, thrustVec, weightVec), 1/jet.mass);
    jet.velocity = clampMagnitude(add(jet.velocity, accel), -jet.maxSpeed, jet.maxSpeed);

    jet.accel = accel;
    jet.drag = dragVec;
    jet.lift = liftVec;
    jet.thrustVec = thrustVec;
    jet.weight = weightVec;

    // console.log(drag, lift, speed);
    // console.log('drag', dragVec, 'lift', liftVec, 'thrust', thrustVec);
    // console.log(
    //   'accel', accel,
    //   'speed', jet.velocity,
    //   'duration', jet.MOVE.duration.toFixed(2),
    // );

    // keep jets moving
    const moveDir = makeVector(vectorTheta(jet.velocity), 1);
    const nextPos = add(jet.contPos, moveDir);
    jet.contPos = nextPos;
    moveEntity(game, jet, round(nextPos));
  }

};

//////////////////////////////////////////////////////////////////////////
// Updating Agents
//////////////////////////////////////////////////////////////////////////

const updateActors = (game): void => {
  let fn = () => {}

  // see comment below
  const notNextActors = {};

  for (const id in game.ACTOR) {
    const actor = game.entities[id];
    if (
      actor == null ||
      actor.actions == null ||
      actor.actions.length == 0
    ) {
      continue;
    }

    if (actor.isAgent) {
      fn = agentDecideAction;
    }
    stepAction(game, actor, fn);

    if (actor.actions.length == 0) {
      notNextActors[id] = true;
    }
  }

  // the reason for deleting them like this instead of just
  // tracking which ones should make it to the next tick, is that
  // new entities can be added to the ACTOR queue inside of stepAction
  // (e.g. an explosive killing another explosive) and they need
  // to make it to the next time this function is called
  for (const id in notNextActors) {
    delete game.ACTOR[id];
  }
}

const updateAgents = (game): void => {
	for (const id of game.AGENT) {
    const agent = game.entities[id];
    if (agent == null) {
      console.log("no agent with id", id);
      continue;
    }
    agent.age += game.timeSinceLastTick;
    agent.timeOnTask += game.timeSinceLastTick;
    agent.prevHPAge += game.timeSinceLastTick;

    if (agent.actions.length == 0) {
      agentDecideAction(game, agent);
    }
	}
}

//////////////////////////////////////////////////////////////////////////
// Explosives, ballistics
//////////////////////////////////////////////////////////////////////////

const updateExplosives = (game): void => {
  for (const id in game.EXPLOSIVE) {
    const explosive = game.entities[id];
    explosive.age += game.timeSinceLastTick;
    if (
      ((explosive.timer != null && explosive.age > explosive.timer)
        || explosive.timer == null)
      && explosive.position != null
      && !isActionTypeQueued(explosive, 'DIE')
    ) {
      queueAction(game, explosive, makeAction(game, explosive, 'DIE'));
    }
  }
};

const updateBallistics = (game): void => {
  for (const id in game.BALLISTIC) {
    const ballistic = game.entities[id];
    if (ballistic == null || ballistic.position == null) continue;
    ballistic.age += game.timeSinceLastTick;
    // if it has collided with something, deal damage to it and die
    // OR if it is within Radius of target, die
    const collisions =
      collidesWith(game, ballistic, ballistic.blockingTypes)
      .filter(e => e.playerID != ballistic.playerID);
    let inRadius = false;
    if (ballistic.targetID != null && ballistic.warhead != null) {
      const target = game.entities[ballistic.targetID];
      if (target != null) {
        if (Math.abs(dist(ballistic.position, target.position)) <= 4) {
          inRadius = true;
        }
      }
    }

    if (collisions.length > 0 || inRadius) {
      if (ballistic.missRate == null ||
        (ballistic.missRate != null && Math.random() > ballistic.missRate)
      ) {
        const alreadyDamaged = {};
        collisions.forEach(e => {
          if (alreadyDamaged[e.id]) return;
          alreadyDamaged[e.id] = true;
          if (ballistic.isPiercing && e.isCollectable) {
            ballistic.hp -= e.hp / 20;
          }
          dealDamageToEntity(game, e, ballistic.damage);
        });


        if (!ballistic.isPiercing || ballistic.hp <= 0) {
          queueAction(game, ballistic, makeAction(game, ballistic, 'DIE'));
        }

        continue;
      }
    }

    // otherwise continue along its trajectory
    let {age, initialTheta, velocity, width, height} = ballistic;
    const prevPosition = add(
      ballistic.contPos,
      {x: width / 2, y: height / 2},
    );
    if (ballistic.prevPositions) {
      ballistic.prevPositions.push(prevPosition);
    }

    const {x, y} = ballistic.initialPosition;
    age /= 10000;
    ballistic.contPos = {
      x: x + velocity * age * Math.cos(initialTheta),
      y: y + velocity * age * Math.sin(initialTheta)
        - 0.5 * globalConfig.config.gravity * age * age,
    };
    ballistic.ballisticTheta = vectorTheta(subtract(
      add(
        ballistic.contPos,
        {x: width / 2, y: height / 2},
      ),
      prevPosition,
    ));

    moveEntity(game, ballistic, round(ballistic.contPos));
    if (!entityInsideGrid(game, ballistic)) {
      queueAction(game, ballistic, makeAction(game, ballistic, 'DIE'));
    }
  }
};

//////////////////////////////////////////////////////////////////////////
// Fire, meltables
//////////////////////////////////////////////////////////////////////////

const updateFlammables = (game): void => {
  for (const id in game.FLAMMABLE) {
    const flammable = game.entities[id];
    // if on fire, burn
    if (flammable.onFire) {
      flammable.isCollectable = false;
      // check if you just caught on fire, and set quantity
      if (flammable.quantity == 0) {
        changePheromoneEmitterQuantity(game, flammable, flammable.heatQuantity);
      }
      flammable.fuel -= game.timeSinceLastTick;
      if (flammable.fuel <= 0) {
        queueAction(game, flammable, makeAction(game, flammable, 'DIE'));
      }
    // if not on fire, check if it should catch on fire
    } else {
      const temp = getTemperature(game, flammable.position);
      if (temp >= flammable.combustionTemp) {
        if (flammable.type != 'AGENT') {
          flammable.onFire = true;
          flammable.isCollectable = false;
        }
      }
    }
  }
}

//////////////////////////////////////////////////////////////////////////
// Towers
//////////////////////////////////////////////////////////////////////////

const updateTowers = (game): void => {
  for (const id in game.TOWER) {
    const tower = game.entities[id];
    const config = Entities[tower.type].config;
    // don't do anything if unpowered
    if (
      tower.isPowerConsumer &&
      !tower.isPowered &&
      !game.pausePowerConsumption
    ) continue;

    // choose target if possible
    if (tower.targetID == null) {
      const possibleTargets = [];
      for (const missileID of game.MISSILE) {
        const missile = game.entities[missileID];
        if (missile.playerID != tower.playerID) {
          possibleTargets.push(missileID);
        }
      }
      tower.targetID = oneOf(possibleTargets);
    }

    // aim at target
    let targetTheta = config.minTheta;
    if (tower.targetID != null) {
      const target = game.entities[tower.targetID];
      // clear dead target
      if (target == null) {
        tower.targetID = null;

      // else aim at living target
      } else {
        const targetPos = game.entities[tower.targetID].position;
        targetTheta = vectorTheta(subtract(targetPos, tower.position)) % (Math.PI / 2);
        targetTheta = clamp(targetTheta, config.minTheta, config.maxTheta);
        if (targetPos.y >= tower.position.y) {
          targetTheta = config.minTheta;
        }
      }
    }

    // treat missile turrets as a special case
    if (tower.type == 'MISSILE_TURRET') {
      tower.thetaAccel = 0;
      tower.theta = clamp(targetTheta, config.minTheta, config.maxTheta);
    } else if (closeTo(tower.theta, targetTheta)) {
      tower.thetaAccel /= -2;
    } else if (tower.theta < targetTheta) {
      tower.thetaAccel = config.thetaAccel;
    } else if (tower.theta > targetTheta) {
      tower.thetaAccel = -1 * config.thetaAccel;
    }
    tower.thetaSpeed += tower.thetaAccel;
    tower.thetaSpeed = clamp(tower.thetaSpeed, -config.maxThetaSpeed, config.maxThetaSpeed);
    tower.theta += tower.thetaSpeed;
    const clamped = clamp(tower.theta, config.minTheta, config.maxTheta);
    if (!closeTo(clamped, tower.theta)) {
      tower.thetaSpeed = 0;
      tower.thetaAccel = 0;
    }
    tower.theta = clamped;

    // shoot at target
    if (tower.targetID != null && !isActionTypeQueued(tower, 'SHOOT')) {
      if (tower.needsCooldown) {
        tower.shotsSinceCooldown += 1;
        if (tower.shotsSinceCooldown > tower.shotsTillCooldown) {
          tower.shotsSinceCooldown = 0;
          queueAction(
            game, tower,
            makeAction(game, tower, 'COOLDOWN', null),
          );
        }
      }

      let canAfford = true;
      if (tower.launchCost) {
        canAfford = canAffordBuilding(game.bases[game.playerID], tower.launchCost);
        if (canAfford) {
          for (const resource in tower.launchCost) {
            game.bases[game.playerID].resources[resource] -= tower.launchCost[resource];
          }
        }
      }

      if (canAfford) {
        queueAction(
          game, tower,
          makeAction(
            game, tower, 'SHOOT',
            {theta: tower.theta, projectileType: tower.projectileType}
          ),
        );
      }
    }

  }
};

//////////////////////////////////////////////////////////////////////////
// Move controlledEntity/View
//////////////////////////////////////////////////////////////////////////


const updateViewPos = (
  game: Game,clampToGrid: boolean,
): void => {
  let nextViewPos = {...game.viewPos};
  const focusedEntity = game.focusedEntity;
  if (focusedEntity) {
    const moveDir = subtract(focusedEntity.position, focusedEntity.prevPosition);
    const action = focusedEntity.actions[0];

    nextViewPos.x = focusedEntity.contPos.x - game.viewWidth / 2;
    nextViewPos.y = focusedEntity.contPos.y - game.viewHeight /2;
  }

  // nextViewPos = {
  //   x: Math.round(nextViewPos.x * 100) / 100,
  //   y: Math.round(nextViewPos.y * 100) / 100,
  // };

  if (!clampToGrid) {
    game.viewPos = nextViewPos;
  } else {
    game.viewPos = {
      x: clamp(nextViewPos.x, 0, game.gridWidth - game.viewWidth),
      y: clamp(nextViewPos.y, 0, game.gridHeight - game.viewHeight),
    };
  }
}

//////////////////////////////////////////////////////////////////////////
// Pheromones
//////////////////////////////////////////////////////////////////////////

const updatePheromoneEmitters = (game: Game): void => {
  for (const id in game.PHEROMONE_EMITTER) {
    const emitter = game.entities[id];
    if (emitter.quantity == 0) continue;
    if (emitter.refreshRate == null) continue;

    if ((game.time + emitter.id) % emitter.refreshRate == 0) {
      changePheromoneEmitterQuantity(game, emitter, emitter.quantity);
    }
  }
};

const updatePheromones = (game: Game): void => {

  if (game.time % globalConfig.config.dispersingPheromoneUpdateRate == 0) {
    game.pheromoneWorker.postMessage({
      type: 'DISPERSE_PHEROMONES',
    });
  }

  // recompute steady-state-based pheromones using the worker
  if (game.reverseFloodFillSources.length > 0) {
    game.pheromoneWorker.postMessage({
      type: 'REVERSE_FLOOD_FILL',
      reverseFloodFillSources: game.reverseFloodFillSources,
    });
    game.reverseFloodFillSources = [];
  }
  if (game.floodFillSources.length > 0) {
    game.pheromoneWorker.postMessage({
      type: 'FLOOD_FILL',
      floodFillSources: game.floodFillSources,
    });
    game.floodFillSources = [];
  }
};

//////////////////////////////////////////////////////////////////////////
// Doing Actions
//////////////////////////////////////////////////////////////////////////

const stepAction = (
  game: Game, entity: Entity, decisionFunction: mixed,
): void => {
  if (entity.actions == null || entity.actions.length == 0) return;

  let curAction = entity.actions[0];
  const totalDuration = getDuration(game, entity, curAction.type);
  if (
    totalDuration - curAction.duration >= curAction.effectIndex &&
    !curAction.effectDone
  ) {
    entityStartCurrentAction(game, entity);
    curAction = entity.actions[0];
  } else if (curAction.duration <= 0) {
    const prevAction = entity.actions.shift();
    entity.prevActionType = prevAction.type;
    curAction = entity.actions[0];
    if (curAction == null) {
      decisionFunction(game, entity);
      curAction = entity.actions[0];
    }
    if (curAction != null && curAction.effectIndex == 0) {
      entityStartCurrentAction(game, entity);
    }
  }
  if (curAction != null) {
    curAction.duration = Math.max(0, curAction.duration - game.timeSinceLastTick);
  }
}

//////////////////////////////////////////////////////////////////////////
// Misc.
//////////////////////////////////////////////////////////////////////////

const updateTiledSprites = (game): void => {
  for (const id of game.staleTiles) {
    const entity = game.entities[id];
    entity.dictIndexStr = getDictIndexStr(game, entity);
  }
  game.staleTiles = [];
}

const updateTicker = (game): void => {
  if (game.ticker != null) {
    game.ticker.time -= game.timeSinceLastTick;
    if (game.ticker.time <= 0) {
      game.ticker = null;
    }
  }

  if (game.miniTicker != null) {
    game.miniTicker.time -= game.timeSinceLastTick;
    if (game.miniTicker.time <= 0) {
      game.miniTicker = null;
    }
  }
};

module.exports = {tickReducer};
