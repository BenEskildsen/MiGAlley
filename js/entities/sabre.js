// @flow

const {makeEntity} = require('./makeEntity');
const {
  subtract, add, makeVector, vectorTheta, round, rotate, floor,
  magnitude,
} = require('../utils/vectors');
const {deepCopy} = require('../utils/helpers');
const {
  getAntSpriteAndOffset
} = require('../selectors/sprites');
const {renderAgent} = require('../render/renderAgent');

const config = {
  hp: 60,
  damage: 20,
  width: 3,
  height: 3,
  maxHold: 1,
  age: 0,

  // jet properties
  isJet: true,
  mass: 5,
  dragCoefficient: -0.00001,
  liftCoefficient:  0.00015,
  thrustRate: 1,
  thrust: 10,
  maxThrust: 50,
  pitchRate: 0.025, // in radians
  minMoveDuration: 30,
  maxMoveDuration: 400,
  startSpeed: 10,
  maxSpeed: 50,
  flipped: false,

  drag: {x: 0, y: 0},
  accel: {x: 0, y: 0},
  lift: {x: 0, y: 0},
  weight: {x: 0, y: 0},
  thrustVec: {x: 0, y: 0},


  // agent properties
  isAgent: true,
  pickupTypes: [
    'FOOD', 'DIRT', 'TOKEN',
    'DYNAMITE', 'COAL', 'IRON', 'STEEL',
  ],
  blockingTypes: [
    'DIRT', 'AGENT',
    'STONE', 'DOODAD',
    'DYNAMITE', 'SABRE', 'MIG',
  ],

  // action params
  MOVE: {
    duration: 45 * 4,
    spriteOrder: [1, 2],
    // maxFrameOffset: 2,
    // frameStep: 2,
  },
  FLIP: {
    duration: 300,
    spriteOrder: [1, 2],
    effectIndex: 299,
  },
  SHOOT: {
    duration: 200,
    spriteOrder: [1, 2, 3, 4],
  },
  DIE: {
    duration: 41 * 2,
    spriteOrder: [8],
  },

  // task-specific params
  WANDER: {
    base: 1,
    forwardMovementBonus: 0,
    prevPositionPenalty: -100,
    ALERT: 500,
    COLONY: 10,
  },
};

const make = (
  game: Game,
	position: Vector, playerID: PlayerID,
): SABRE => {
  const theta = Math.PI * 0.9;
	const agent = {
		...makeEntity(
      'SABRE', position,
      config.width, config.height,
    ),
    ...deepCopy(config),
		playerID: parseInt(playerID),
    prevHP: config.hp,
    prevHPAge: 0,
    theta,
    holding: null,
    holdingIDs: [], // treat holding like a stack
    task: 'WANDER',
    timeOnTask: 0,
    actions: [],
    lastHeldID: null,

    contPos: {...position},

    velocity: makeVector(theta, -1 * config.startSpeed),

    // this frame offset allows iterating through spritesheets across
    // multiple actions (rn only used by queen ant doing one full walk
    // cycle across two MOVE actions)
    frameOffset: 0,
    timeOnMove: 0, // for turning in place
	};

  return agent;
};

const render = (ctx, game: Game, agent: Agent): void => {
  renderAgent(ctx, game, agent, spriteRenderFn);
}

const spriteRenderFn = (ctx, game, jet) => {
  const {position, width, height, theta} = jet;

  // ctx.strokeStyle = "black";
  // ctx.fillStyle = "red";
  // ctx.globalAlpha = 0.1;
  // ctx.fillRect(0, 0, width, height * 0.7);
  // ctx.globalAlpha = 1;
  // ctx.strokeRect(0, 0, width, height * 0.7);

  // render force arrows
  if (game.showForceVectors) {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-1 * jet.theta);
    const forces = {
      lift: 'red',
      thrustVec: 'green',
      weight: 'orange',
      drag: 'purple',
      accel: 'yellow',
      velocity: 'brown',
    };
    for (const force in forces) {
      const vec = jet[force];
      const theta = vectorTheta(vec);
      const mag = Math.abs(magnitude(vec));
      ctx.save();
      ctx.rotate(theta);
      ctx.fillStyle = forces[force];
      ctx.fillRect(0, 0, mag * 5, 0.5);

      ctx.restore();
    }
    ctx.restore();
  }


  const sprite = {
    img: game.sprites.SABRE,
  };
  if (sprite.img != null) {
    ctx.save();
    if (!jet.flipped) {
      ctx.scale(1, -1);
    }
    ctx.drawImage(
      sprite.img, // sprite.x, sprite.y, sprite.width, sprite.height,
      -2 * jet.width, -2 * jet.height, 4 * jet.width, 4 *jet.height,
    );
    ctx.restore();
  }
}

module.exports = {
  make, render, config,
};
