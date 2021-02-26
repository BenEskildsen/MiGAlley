// @flow

const {makeEntity}= require('./makeEntity.js');
const {add, subtract, equals, makeVector, vectorTheta} = require('../utils/vectors');
const {getLaserBarrelSprite} = require('../selectors/sprites');

const config = {
  isTower: true,
  isPowerConsumer: true,
  powerConsumed: 4,
  hp: 120,
  width: 4,
  height: 4,
  damage: 10,
  thetaAccel: 0.00005,
  minTheta: 0.2,
  maxTheta: Math.PI - 0.2,
  maxThetaSpeed: 0.04,

  needsCooldown: true,
  shotsTillCooldown: 40,

  // action overrides
  DIE: {
    duration: 2,
    spriteOrder: [0],
  },
  SHOOT: {
    duration: 1,
    spriteOrder: [1],
  },
  COOLDOWN: {
    duration: 1800,
    spriteOrder: [0],
  },

  cost: {
    STEEL: 16,
    GLASS: 8,
    SILICON: 4,
  },
};

const make = (
  game: Game,
  position: Vector,
  playerID: PlayerID,
  projectileType: ?EntityType,
  fireRate: ?number,
  name: ?String,
  theta: ?number,
): Tower => {
  const configCopy = {...config};
  if (fireRate != null) {
    configCopy.SHOOT = {
      ...configCopy.SHOOT,
      duration: fireRate,
    }
  }
  return {
    ...makeEntity('LASER_TURRET', position, config.width, config.height),
    ...configCopy,
    playerID,

    // power:
    isPowered: false,
    name: name != null ? name : 'Laser Turret',
    shotsSinceCooldown: 0,

    // angle of the turret
    theta: theta != null ? theta : config.minTheta,
    thetaSpeed: 0,
    thetaAccel: 0,

    // what the tower wants to aim at
    targetID: null,

    projectileType: projectileType != null ? projectileType : 'LASER',

    actions: [],


  };
};

const render = (ctx, game, turret): void => {
  const {position, width, height, theta} = turret;
  ctx.save();
  ctx.translate(
    position.x, position.y,
  );

  // barrel of turret
  ctx.save();
  ctx.fillStyle = "black";
  const turretWidth = 4;
  const turretHeight = 0.3;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(theta);
  ctx.translate(-1 * turretWidth * 0.75, -turretHeight / 2);
  ctx.fillRect(0, 0, turretWidth, turretHeight);
  ctx.restore();

  // base of turret
  ctx.strokeStyle = "black";
  ctx.fillStyle = "steelblue";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeRect(0, 0, width, height);


  ctx.restore();
  // const {position, width, height, theta} = turret;
  // ctx.save();
  // ctx.translate(
  //   position.x, position.y,
  // );

  // // base of turret
  // const img = game.sprites.LASER_TURRET;
  // const xOffset = (turret.isPowered || game.pausePowerConsumption) ? 0 : 48;
  // ctx.drawImage(
  //   img,
  //   xOffset, 0, 48, 48,
  //   0, 0, width, height,
  // );

  // // barrel of turret
  // ctx.save();
  // const turretWidth = 3;
  // const turretHeight = 3;
  // ctx.translate(width / 2, height / 2);
  // ctx.rotate(theta);
  // ctx.translate(-1 * turretWidth * 0.75, -turretHeight / 2 - 0.25);
  // const obj = getLaserBarrelSprite(game, turret);
  // ctx.drawImage(
  //   obj.img,
  //   obj.x, obj.y, obj.width, obj.height,
  //   0, 0, turretWidth, turretHeight,
  // );
  // ctx.restore();

  // ctx.restore();
};


module.exports = {
  make, render, config,
};
