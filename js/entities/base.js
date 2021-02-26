// @flow

const {makeEntity} = require('./makeEntity');
const globalConfig = require('../config');

const config = {
  hp: 150,
  width: 3,
  height: 3,
  pheromoneEmitter: true,
  pheromoneType: 'COLONY',

  // need this for panning to focus on it
  MOVE: {
    duration: 10,
  },
};

const make = (
  game: Game,
  position: Vector,
  playerID,
  quantity: ?number,
): Base => {
  return {
    ...makeEntity('BASE', position, config.width, config.height),
    ...config,
    playerID,
    quantity: quantity || globalConfig.pheromones[config.pheromoneType].quantity,
    actions: [],
  };
};

const render = (ctx, game, base): void => {
  const img = game.sprites.BASE;
  ctx.drawImage(img, base.position.x, base.position.y, base.width, base.height);
};

module.exports = {config, make, render};
