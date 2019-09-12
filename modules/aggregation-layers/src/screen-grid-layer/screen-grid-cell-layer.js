// Copyright (c) 2015 - 2019 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import GL from '@luma.gl/constants';
import {Model, Geometry, FEATURES, hasFeatures} from '@luma.gl/core';
import {Layer, log} from '@deck.gl/core';
import {defaultColorRange, colorRangeToFlatArray} from '../utils/color-utils';
import vs from './screen-grid-layer-vertex.glsl';
import fs from './screen-grid-layer-fragment.glsl';

const DEFAULT_MINCOLOR = [0, 0, 0, 0];
const DEFAULT_MAXCOLOR = [0, 255, 0, 255];
const COLOR_PROPS = [`minColor`, `maxColor`, `colorRange`, `colorDomain`];

const defaultProps = {
  cellSizePixels: {value: 100, min: 1},
  cellMarginPixels: {value: 2, min: 0, max: 5},

  colorDomain: null,
  colorRange: defaultColorRange
};

export default class ScreenGridCellLayer extends Layer {
  static isSupported(gl) {
    return hasFeatures(gl, [FEATURES.TEXTURE_FLOAT]);
  }

  getShaders() {
    return {vs, fs, modules: ['picking']};
  }

  initializeState() {
    const {gl} = this.context;
    const attributeManager = this.getAttributeManager();
    attributeManager.addInstanced({
      instancePositions: {size: 3, update: this.calculateInstancePositions},
      instanceCounts: {size: 4, instanced: true, noAlloc: true}
    });
    this.setState({
      model: this._getModel(gl)
    });
  }

  updateState({oldProps, props, changeFlags}) {
    super.updateState({oldProps, props, changeFlags});

    if (oldProps.cellSize !== props.cellSize || changeFlags.viewportChanged) {
      const attributeManager = this.getAttributeManager();
      attributeManager.invalidateAll();
    }

    this._updateUniforms({oldProps, props, changeFlags});
  }

  draw({uniforms}) {
    const {parameters = {}, maxTexture} = this.props;
    const minColor = this.props.minColor || DEFAULT_MINCOLOR;
    const maxColor = this.props.maxColor || DEFAULT_MAXCOLOR;

    // If colorDomain not specified we use default domain [1, maxCount]
    // maxCount value will be sampled form maxTexture in vertex shader.
    const colorDomain = this.props.colorDomain || [1, 0];
    const {model, cellScale, shouldUseMinMax, colorRange} = this.state;
    const layerUniforms = {
      minColor,
      maxColor,
      maxTexture,
      cellScale,
      colorRange,
      colorDomain,
      shouldUseMinMax
    };

    uniforms = Object.assign(layerUniforms, uniforms);
    model.draw({
      uniforms,
      parameters: Object.assign(
        {
          depthTest: false,
          depthMask: false
        },
        parameters
      )
    });
  }

  calculateInstancePositions(attribute, {numInstances}) {
    const {width, height} = this.context.viewport;
    const {cellSizePixels, numCol} = this.props;
    const {value, size} = attribute;

    for (let i = 0; i < numInstances; i++) {
      const x = i % numCol;
      const y = Math.floor(i / numCol);
      value[i * size + 0] = ((x * cellSizePixels) / width) * 2 - 1;
      value[i * size + 1] = 1 - ((y * cellSizePixels) / height) * 2;
      value[i * size + 2] = 0;
    }
  }

  // Private Methods

  _getModel(gl) {
    return new Model(
      gl,
      Object.assign({}, this.getShaders(), {
        id: this.props.id,
        geometry: new Geometry({
          drawMode: GL.TRIANGLE_FAN,
          attributes: {
            positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0])
          }
        }),
        isInstanced: true
      })
    );
  }

  _shouldUseMinMax() {
    const {minColor, maxColor, colorDomain, colorRange} = this.props;
    if (minColor || maxColor) {
      log.deprecated('ScreenGridLayer props: minColor and maxColor', 'colorRange, colorDomain')();
      return true;
    }
    // minColor and maxColor not supplied, check if colorRange or colorDomain supplied.
    // NOTE: colorDomain and colorRange are experimental features, use them only when supplied.
    if (colorDomain || colorRange) {
      return false;
    }
    // None specified, use default minColor and maxColor
    return true;
  }

  _updateUniforms({oldProps, props, changeFlags}) {
    const newState = {};
    if (COLOR_PROPS.some(key => oldProps[key] !== props[key])) {
      newState.shouldUseMinMax = this._shouldUseMinMax();
    }

    if (oldProps.colorRange !== props.colorRange) {
      newState.colorRange = colorRangeToFlatArray(props.colorRange);
    }

    if (
      oldProps.cellMarginPixels !== props.cellMarginPixels ||
      oldProps.cellSizePixels !== props.cellSizePixels ||
      changeFlags.viewportChanged
    ) {
      const {width, height} = this.context.viewport;
      const {cellSizePixels, cellMarginPixels} = this.props;
      const margin = cellSizePixels > cellMarginPixels ? cellMarginPixels : 0;

      newState.cellScale = new Float32Array([
        ((cellSizePixels - margin) / width) * 2,
        (-(cellSizePixels - margin) / height) * 2,
        1
      ]);
    }
    this.setState(newState);
  }
}

ScreenGridCellLayer.layerName = 'ScreenGridCellLayer';
ScreenGridCellLayer.defaultProps = defaultProps;
