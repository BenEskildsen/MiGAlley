// @flow

const {add} = require('../utils/vectors');
const {makeEntity} = require('./makeEntity');
const {getInterpolatedIndex} = require('../selectors/sprites');
const {getDuration} = require('../simulation/actionQueue');
const globalConfig = require('../config');


const config = {
  isBallistic: true,
  damage: 10,
  hp: 1,
  width: 2,
  height: 1,
  velocity: 1500,
  blockingTypes: [
    'DIRT', 'STONE', 'FOOD', 'AGENT',
    'DOODAD', 'WORM', 'MISSILE',
    'TURBINE', 'IRON', 'STEEL', 'COAL',
    'ICE', 'URANIUM',
  ],

  DIE: {
    duration: 1,
    spriteOrder: [0],
  },
  missRate: 0,
};

const make = (
  game: Game,
  position: Vector,
  playerID: PlayerID,
  theta: Radians,
  velocity: ?number,
): Bullet => {
  return {
    ...makeEntity('BULLET', position, config.width, config.height),
    ...config,
    playerID,

    // required for ballistics
    age: 0,
    actions: [],
    theta,
    velocity: velocity != null ? velocity : config.velocity,
    initialPosition: {...position},
    contPos: {...position},
    ballisticTheta: theta,
    initialTheta: theta,
  };
};

const render = (ctx, game, bullet): void => {
  ctx.save();
  const {
    width, height, theta,
    ballisticTheta,
    contPos, prevPositions,
  } = bullet;
  const position = contPos;

  ctx.translate(
    position.x + width / 2,
    position.y + height / 2,
  );
  ctx.rotate(ballisticTheta + Math.PI / 2);
  ctx.translate(-width / 2, -height / 2);

  ctx.fillStyle = 'orange';
  ctx.strokeStyle = 'black';
  const bulletWidth = 0.2;
  ctx.fillRect(
    bullet.width / 2 - bulletWidth / 2, 0,
    bulletWidth, bullet.height,
  );
  ctx.strokeRect(
    bullet.width / 2 - bulletWidth / 2, 0,
    bulletWidth, bullet.height,
  );

  ctx.restore();
};

module.exports = {config, make, render};
