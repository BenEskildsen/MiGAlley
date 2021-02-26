// @flow

const {
  addEntity, removeEntity, markEntityAsStale,
  changeEntitySize, changeEntityType,
} = require('../simulation/entityOperations');
const {
  entityInsideGrid, lookupInGrid, getEntityPositions,
} = require('../utils/gridHelpers');
const {
  queueAction, makeAction, isActionTypeQueued,
} = require('../simulation/actionQueue');
const {add, subtract, round, floor, ceil, equals} = require('../utils/vectors');
const {render} = require('../render/render');
const {fillPheromone, clearPheromone, setPheromone} = require('../simulation/pheromones');
const {clamp, encodePosition, decodePosition} = require('../utils/helpers');
const {getEntityPheromoneSources} = require('../selectors/pheromones');
const {Entities} = require('../entities/registry');
const globalConfig = require('../config');

import type {Game, Action} from '../types';

const gameReducer = (game: Game, action: Action): Game => {
  switch (action.type) {
    case 'SET': {
      const {property, value} = action;
      game[property] = value;
      return game;
    }
    case 'ENQUEUE_ENTITY_ACTION': {
      const {entityAction, entity} = action;
      queueAction(game, entity, entityAction);
      return game;
    }
    case 'SET_VIEW_POS': {
      const {viewPos, viewWidth, viewHeight} = action;
      game.viewPos = viewPos;
      if (viewWidth != null) {
        game.viewWidth = viewWidth;
      }
      if (viewHeight != null) {
        game.viewHeight = viewHeight;
      }
      if (action.rerender) {
        render(game);
      }
      return game;
    }
    case 'INCREMENT_ZOOM': {
      const {zoom} = action;
      const ratio = game.viewWidth / game.viewHeight;
      const widthInc = Math.round(zoom * ratio * 10);
      const heightInc = Math.round(zoom * ratio * 10);

      const nextWidth = game.viewWidth + widthInc;
      const nextHeight = game.viewHeight + heightInc;

      // don't allow zooming out too far
      if (nextWidth > 300 || nextHeight > 300) return game;

      const oldWidth = game.viewWidth;
      const oldHeight = game.viewHeight;
      game.viewWidth = clamp(nextWidth, Math.round(5 * ratio), game.gridWidth + 50);
      game.viewHeight = clamp(nextHeight, Math.round(5 * ratio), game.viewHeight + 50);
      game.viewPos = floor({
        x: (oldWidth - game.viewWidth) / 2 + game.viewPos.x,
        y: (oldHeight - game.viewHeight) / 2 + game.viewPos.y,
      });
      render(game); // HACK: for level editor
      return game;
    }
    case 'SET_PHEROMONE_VISIBILITY': {
      const {pheromoneType, isVisible} = action;
      game.pheromoneDisplay[pheromoneType] = isVisible;
      return game;
    }
    case 'SET_TICKER_MESSAGE': {
      const {message, time, isMini} = action;
      if (!isMini) {
        game.ticker = {
          message,
          time,
          max: time,
        };
      } else {
        game.miniTicker = {
          message,
          time,
          max: time,
        };
      }
      return game;
    }
    case 'CREATE_ENTITY': {
      const {entity, position} = action;
      if (position != null) {
        game.prevInteractPosition = position;
      }
      return addEntity(game, entity);
    }
    case 'DELETE_ENTITY': {
      const {entity} = action;
      removeEntity(game, entity);
      return game;
    }
    case 'CREATE_ENTITIES': {
      return createEntitiesReducer(game, action);
    }
    case 'SET_ON_FIRE': {
      const {entityID} = action;
      game.entities[entityID].onFire = true;
      return game;
    }
    case 'COPY_ENTITIES': {
      const {rect} = action;
      game.clipboard = rect;
      return game;
    }
    case 'PASTE_ENTITIES': {
      const {pastePos} = action;
      const {position, width, height} = game.clipboard;
      game.viewImage.isStale = true;

      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const entities = lookupInGrid(game.grid, add(position, {x, y}))
            .map(id => game.entities[id])
            .filter(e => equals(e.position, add(position, {x, y})));
          for (const copyEntity of entities) {
            const pos = add(pastePos, {x, y});
            const key = encodePosition(pos);
            game.viewImage.stalePositions[key] = pos;

            const entity = {...copyEntity, position: pos};
            if (!entityInsideGrid(game, entity)) continue;
            addEntity(game, entity);
          }
        }
      }

      return game;
    }
    case 'FILL_PHEROMONE': {
      const {gridPos, pheromoneType, playerID, quantity, rect} = action;
      if (rect != null) {
        const {position, width, height} = rect;
          for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
              const pos = add(position, {x, y});
              fillPheromone(game, pos, pheromoneType, playerID, quantity);
            }
          }
      } else if (gridPos != null) {
        fillPheromone(game, gridPos, pheromoneType, playerID, quantity);
      }
      return game;
    }
    case 'UPDATE_ALL_PHEROMONES': {
      const {pheromones} = action;
      // console.log('received pheromone update', pheromones, game.time);
      let allWaterQuantity = game.ICE.length;
      let shouldUpdateWaterQuantity = false;
      for (const positionHash of pheromones) {
        for (const encodedPosition in positionHash) {
          const position = decodePosition(encodedPosition);
          const {pheromoneType, quantity, playerID} = positionHash[encodedPosition];
          setPheromone(game, position, pheromoneType, quantity, playerID, true /*no worker*/);
          if (pheromoneType == 'WATER' || pheromoneType == 'STEAM') {
            shouldUpdateWaterQuantity = true;
            allWaterQuantity++;
          }
        }
      }
      if (shouldUpdateWaterQuantity) {
        game.allWaterQuantity = allWaterQuantity;
      }
      return game;
    }
    case 'SHOW_DEBUG': {
      const {shouldShow, showType} = action;
      game[showType] = shouldShow;
      return game;
    }
    case 'DELETE_ENTITIES': {
      const {rect} = action;
      const {position, width, height} = rect;
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const pos = add(position, {x, y});
          const ids = lookupInGrid(game.grid,  pos);
          for (const id of ids) {
            const entity = game.entities[id];
            removeEntity(game, entity);
            if (entity.notAnimated) {
              game.viewImage.allStale = true;
            }
          }
        }
      }
      return game;
    }
    case 'SET_SPRITE_SHEET': {
      const {name, img} = action;
      game.sprites[name] = img;
      game.viewImage.isStale = true;
      game.viewImage.allStale = true;
      return game;
    }
    case 'SET_TUTORIAL_FLAG': {
      const {flag} = action;
      game.tutorialFlags[flag] = game.time;
      return game;
    }
    case 'SET_DIFFICULTY': {
      const {difficulty} = action;
      game.difficulty = difficulty;
      game.missileFrequency = globalConfig.config.difficulty[difficulty].startFrequency;
      return game;
    }
    case 'SET_MOUSE_MODE': {
      const {mouseMode} = action;
      game.mouseMode = mouseMode;
      return game;
    }
    case 'SET_KEEP_MARQUEE': {
      const {keepMarquee} = action;
      game.keepMarquee = keepMarquee;
      return game;
    }
    case 'SET_GAME_OVER': {
      /**
       * false | 'win' | 'lose'
       */
      const {gameOver} = action;
      game.gameOver = gameOver;
      return game;
    }
  }
  return game;
};

function createEntitiesReducer(game: Game, action): Game {
  const {entityType, args, rect} = action;
  const {position, width, height} = rect;
  const {make, config} = Entities[entityType];

  if (config.onlyMakeOne) {
    const occupied = lookupInGrid(game.grid,  position)
      .map(id => game.entities[id])
      .filter(e => !e.notOccupying)
      .length > 0;
    const entity = make(game, position, ...args);
    if (!occupied && entityInsideGrid) {
      addEntity(game, entity);
    }
  } else {
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const pos = add(position, {x, y});
        const occupied = lookupInGrid(game.grid,  pos)
          .map(id => game.entities[id])
          .filter(e => !e.notOccupying)
          .length > 0;
        if (occupied) continue;
        const entity = make(game, pos, ...args);
        if (!entityInsideGrid(game, entity)) continue;
        addEntity(game, entity);
      }
    }
  }
  if (Entities[entityType].config.notAnimated) {
    game.viewImage.allStale = true;
  }
  return game;
}

module.exports = {gameReducer};
