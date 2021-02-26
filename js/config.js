// @flow

const config = {
  msPerTick: 16,

  canvasWidth: 1200,
  canvasHeight: 1200,

  viewWidth: 200,
  viewHeight: 200,
  useFullScreen: true,
  cellWidth: 20,
  cellHeight: 16,

  audioFiles: [
    {path: 'audio/Song Oct. 9.wav', type: 'wav'},
  ],

  dispersingPheromoneUpdateRate: 6,
  gravity: -100,

};

const pheromoneBlockingTypes = [
  'DIRT',  'STONE', 'DOODAD', 'TURRET',
  'STEEL', 'IRON',
];

const pheromones = {
  LIGHT: {
    quantity: 350,
    decayAmount: 1,
    color: 'rgb(155, 227, 90)',
    tileIndex: 0,

    blockingTypes: pheromoneBlockingTypes,
    blockingPheromones: [],
  },
  HEAT: {
    quantity: 150,
    decayAmount: 15,
    decayRate: 1, // how much it decays per tick
    color: 'rgb(255, 0, 0)',
    tileIndex: 2,

    blockingTypes: pheromoneBlockingTypes,
    blockingPheromones: [],
    isDispersing: true,
  },
};

module.exports = {config, pheromones};
