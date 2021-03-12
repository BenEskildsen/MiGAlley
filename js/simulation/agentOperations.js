// @flow

const {
  add, subtract, vectorTheta, makeVector, containsVector,
  dist, equals, magnitude, round,
} = require('../utils/vectors');
const {closeToTheta, thetaToDir, isDiagonalMove} = require('../utils/helpers');
const globalConfig = require('../config');
const {
  addEntity, removeEntity, moveEntity, pickupEntity, putdownEntity,
  rotateEntity, changeEntityType,
  addSegmentToEntity,
} = require('../simulation/entityOperations');
const {
  lookupInGrid, insideGrid,
  entityInsideGrid, getEntityPositions,
} = require('../utils/gridHelpers');
const {
  collides, collidesWith,
} = require('../selectors/collisions');
const {
  getPositionsInFront, getPositionsBehind, isFacing, canDoMove,
} = require('../selectors/misc');
const {
  getPheromoneAtPosition, getAllPheromonesAtPosition,
} = require('../selectors/pheromones');
const {
  getNeighborPositions, getNeighborEntities, areNeighbors,
  getFreeNeighborPositions, getNeighborEntitiesAndPosition,
} = require('../selectors/neighbors');
const {fillPheromone} = require('../simulation/pheromones');
const {oneOf, weightedOneOf} = require('../utils/stochastic');
const {
  makeAction, isActionTypeQueued,
  queueAction, stackAction, cancelAction,
} = require('../simulation/actionQueue');
const {Entities} = require('../entities/registry');

import type {
  Game, Task, Grid, Entity, EntityID, EntityType, Ant, Spider,
} from '../types';

const agentPickup = (
  game: Game, agent: Agent, entity: Entity, pickupPos: Vector,
): Game => {
  const {config} = Entities[agent.type];
  // if (!areNeighbors(game, agent, entity)) return game;
  if (!config.pickupTypes.includes(entity.type)) return game;

  // support picking up more than 1 thing
  if (agent.holdingIDs.length >= config.maxHold) return game;

  // update task need if agent not doing go_to_dirt picks up marked dirt
  if (
    agent.task != 'GO_TO_DIRT' && entity.type == 'DIRT' && entity.marked == agent.playerID &&
    game.bases[agent.playerID].taskNeed['GO_TO_DIRT'] > 0
  ) {
    game.bases[agent.playerID].taskNeed['GO_TO_DIRT'] -= 1;
  }

  // do the actual pickup
  agent.holding = pickupEntity(game, entity, pickupPos);
  agent.holdingIDs.push(agent.holding.id);
  agent.lastHeldID = agent.holding.id;

  return game;
}

const agentPutdown = (game: Game, agent: Agent): Game => {
  if (agent.holding == null) {
    return game;
  }

  const putDownPositions = getPositionsInFront(game, agent);
  for (const putDownPos of putDownPositions) {

    const occupied = lookupInGrid(game.grid, putDownPos)
      .map(id => game.entities[id])
      .filter(e => !e.notBlockingPutdown)
      .length > 0;
    if (occupied) continue;
    if (!insideGrid(game.grid, putDownPos)) continue;

    putdownEntity(game, agent.holding, putDownPos);
    // allow holding more than 1 thing
    agent.holdingIDs.pop();
    if (agent.holdingIDs.length == 0) {
      agent.holding = null;
    } else {
      agent.holding = game.entities[agent.holdingIDs[agent.holdingIDs.length - 1]];
    }
    break;
  }

  return game;
}

const agentSwitchTask = (game: Game, agent: Agent, task: Task): Game => {
  if (agent.task == task) return game; // don't switch to task you're already doing
  // TODO: handling "improper" task transitions like this is not scaleable
  if (agent.task == 'GO_TO_DIRT' && task != 'MOVE_DIRT') {
    game.bases[agent.playerID].taskNeed['GO_TO_DIRT'] += 1;
  }

  agent.task = task;
  if (game.bases[agent.playerID].taskNeed[task] != null) {
    game.bases[agent.playerID].taskNeed[task] -= 1;
  }
  agent.timeOnTask = 0;
  return game;
}

// -----------------------------------------------------------------------
// Agent Decision
// -----------------------------------------------------------------------

const agentDecideMove = (game: Game, agent: Agent): Game => {
  const config = agent;
  let blockers = config.blockingTypes;
  if (!blockers) {
    console.error("no blockers", agent);
    blockers = [...Entities.AGENT.config.blockingTypes];
  }

  let freeNeighbors = getFreeNeighborPositions(game, agent, blockers)
    .filter(pos => canDoMove(game, agent, pos).result);
  if (agent.segmented) {
    freeNeighbors = freeNeighbors.filter(p => !isDiagonalMove(agent.position, p));
  }
  if (freeNeighbors.length == 0) {
    agent.prevPosition = {...agent.position};
    return game;
  }

  let taskConfig = config[agent.task];
  for (const pherType in globalConfig.pheromones) {
    if (taskConfig[pherType] == null) {
      taskConfig[pherType] = 0;
    }
  }
  const playerID = game.playerID;
  const baseScore = taskConfig.base;

  const basePher = getAllPheromonesAtPosition(game, agent.position, playerID);
  const pheromoneNeighbors = freeNeighbors
    .map(pos => getAllPheromonesAtPosition(game, pos, playerID));
  let neighborScores = freeNeighbors.map(n => baseScore);
  for (let i = 0; i < freeNeighbors.length; i++) {
    const pos = freeNeighbors[i];

    // weight this square across each pheromone value
    const pher = pheromoneNeighbors[i];
    for (const pherType in pher) {
      neighborScores[i] +=
        (pher[pherType] - basePher[pherType]) * taskConfig[pherType]
    }

    // penalize moving to previous position
    if (equals(pos, agent.prevPosition)) {
      neighborScores[i] += taskConfig.prevPositionPenalty;
    }

    // boost continuing to move straight
    if (magnitude(subtract(pos, agent.prevPosition)) == 2) {
      neighborScores[i] += taskConfig.forwardMovementBonus;
    }

    // normalize score
    neighborScores[i] = Math.max(baseScore, neighborScores[i]);
    neighborScores[i] = Math.ceil(neighborScores[i]);
  }

  // don't let every neighbor have 0 score
  let allZero = true;
  for (let j = 0; j < neighborScores.length; j++) {
    if (neighborScores[j] != 0) {
      allZero = false;
    }
  }
  if (allZero) {
    neighborScores = neighborScores.map(s => 1);
  }
  const nextPos = weightedOneOf(freeNeighbors, neighborScores);
  if (nextPos == null) {
    console.log('nextPos was null', nextPos);
    console.log(neighborScores, allZero);
  }
  if (game.showAgentDecision) {
    agent.decisions = [];
    for (let i = 0; i < freeNeighbors.length; i++) {
      agent.decisions.push({
        position: freeNeighbors[i],
        score: neighborScores[i],
        chosen: equals(freeNeighbors[i], nextPos),
      });
    }
  }

  agentDecideTask(game, agent, nextPos);

  queueAction(game, agent, makeAction(game, agent, 'MOVE', {nextPos}));
  return game;
}


const agentDecideTask = (game, agent, nextPos): void => {
  if (agent.isCollectable) return; // collectables already have their task set

  const holdingFood = agent.holding != null && agent.holding.type == 'FOOD';
  const holdingDirt = agent.holding != null && agent.holding.type == 'DIRT';

  const pherAtCell = getAllPheromonesAtPosition(game, nextPos, agent.playerID);

  return agent.task;
}

// ----------------------------------------------------------------------
// Deciding actions
// ----------------------------------------------------------------------

const agentDecideAction = (game: Game, agent: Agent): void => {
  if (game.controlledEntity != null && game.controlledEntity.id == agent.id) {
    return; // action decided by player
  }

  switch (agent.type) {
    case 'AGENT':
    case 'WORM':  {
      // MOVE
      agentDecideMove(game, agent);
    }
  }

};

module.exports = {
  agentDecideAction,
  agentPickup,
  agentPutdown,
  agentDecideMove,
  agentSwitchTask,
};
