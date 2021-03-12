// @flow

const initSpriteSheetSystem = (store) => {
  // TODO: don't load sprites if they're already loaded
  const {dispatch} = store;
  const state = store.getState();


  loadSprite(dispatch, state, 'URANIUM', './img/URANIUM.png');
  loadSprite(dispatch, state, 'DIRT', './img/DIRT.png');
  loadSprite(dispatch, state, 'IRON', './img/IRON.png');
  loadSprite(dispatch, state, 'STEEL', './img/STEEL.png');
  loadSprite(dispatch, state, 'COAL', './img/COAL.png');
  loadSprite(dispatch, state, 'HOT_COAL', './img/HOT_COAL.png');
  loadSprite(dispatch, state, 'STONE', './img/STONE.png');
  loadSprite(dispatch, state, 'SULPHUR', './img/SULPHUR.png');

  loadSprite(dispatch, state, 'MISSILE', './img/Missile2.png');
  loadSprite(dispatch, state, 'NUKE_MISSILE', './img/NukeMissile1.png');
  loadSprite(dispatch, state, 'BUNKER_BUSTER', './img/BunkerBuster1.png');

  loadSprite(dispatch, state, 'PHEROMONE', './img/Pheromones.png');

  loadSprite(dispatch, state, 'ALERT', './img/Exclamation1.png');
  loadSprite(dispatch, state, 'WANDER', './img/Ellipsis1.png');

  loadSprite(dispatch, state, 'SKYLINE', './img/Skyline1.png');

  loadSprite(dispatch, state, 'SABRE', './img/Sabre2.png');
  loadSprite(dispatch, state, 'MIG', './img/MiG1.png');
};

const loadSprite = (dispatch, state, name, src): void => {
  // if (
  //   state.game != null && state.game.sprites != null &&
  //   state.game.sprites[name] != null
  // ) return;
  const img = new Image();
  img.addEventListener('load', () => {
  //  console.log("loaded " + src + " spritesheet");
    dispatch({
      type: 'SET_SPRITE_SHEET',
      name,
      img,
    });
  }, false);
  img.src = src;
}

module.exports = {initSpriteSheetSystem};
