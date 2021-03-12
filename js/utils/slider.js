// @flow

const React = require('react');
const ReactDOM = require('react-dom');
const Slider = require('../ui/components/slider.react');

type Props = {
  name: String,
  min: ?number,
  max: ?number,
  step: ?number,
  onChange: () => void | null,
};

/**
 * slider is a function that takes in a value and then outputs an html slider
 * on the screen. It outputs the value of that slider.
 *
 * Since the slider's default value is the value initially provided, you
 * must run the code again after the slider is manipulated in order to see
 * this change reflected in main program. You can do this either by having the
 * call to slider inside the event loop of a game or simulation, or you can provide
 * an onChange function to the props that can run the code again
 *
 * The additional thing it needs to work is adding
 *
      <div
        id="sliderSidebar" style={{display: 'inline-block'}}
      />
 *
 * to the main React.Fragment
 */

let allSliders = {};
let allValues = {};

const slider = (value: number, props: Props): number => {

  if (!allValues[props.name]) {
    allValues[props.name] = value;
  }

  // make a slider if it doesn't already exist
  let thisSlider = (
    <Slider
      min={props.min || 0}
      max={props.max || 10}
      step={props.step || 1}
      value={allValues[props.name]}
      onChange={(val) => {
        if (props.onChange) {
          props.onChange(val);
        }
        allValues[props.name] = val;
      }}
      label={props.name}
      key={props.name + "_slider"}
    />
  );

  allSliders[props.name] = thisSlider;

  // make slider sidebar if it doesn't exist
  const sidebar = document.getElementById('sliderSidebar');
  sidebar.style.width = 400;
  sidebar.style.height = '100%';
  sidebar.style.border = '1px solid black';
  sidebar.style.float = 'left';

  ReactDOM.render(
    (
      <div
        style={{
          padding: 4,
        }}
      >
        {Object.values(allSliders)}
      </div>
    ),
    sidebar,
  );

  // get value from the slider
  return allValues[props.name];
}

window.values = allValues;

module.exports = {slider};
