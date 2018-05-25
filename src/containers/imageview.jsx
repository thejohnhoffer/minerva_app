import React, { Component } from "react";

import viaWebGL from 'viawebgl';
import AmazonWebSource from '../amazonwebsource';

import '../style/imageview';


const differSet = (a, b) => [...a].filter(i => !b.has(i));
const intersectSet = (a, b) => [...a].filter(b.has.bind(b));

class ImageView extends Component {

  constructor() {
    super();
    this.viewer = undefined;
    this.cache = {
      img: new Map(),
      channels: new Map()
    };
    this.changes = {
      redrawn: [],
      gained: [],
      lost: [],
    },
    this.state = {
  		auth: {
				AccessKeyId: process.env.ACCESSKEYID,
				SessionToken: process.env.SESSIONTOKEN,
			  SecretAccessKey: process.env.SECRETACCESSKEY
			}
    }
  }

  makeTileSource(id) {
    const {auth} = this.state;
    const {img, channels} = this.props;

    const channel = channels.get(id);
    if (channel == undefined) {
      return undefined;
    }

    const {color, range} = channel;
    const {url} = img;

		const getTileName = (x, y, level, channel) => {
			return "C" + channel + "-T0-Z0-L" + level + "-Y" + y + "-X" + x + ".png";
		}

		const getTileUrl = function(l, x, y) {
			const level = this.maxLevel - l;
			const url = this.many_channel_url;
			const channel = this.many_channel_id;

			const name = getTileName(x, y, level, channel);
			return url + '/' + name;
		}

    return {
			// Custom functions
    	makeAjaxRequest: new AmazonWebSource(auth).makeAjaxRequest,
			getTileUrl: getTileUrl,
			// CUstom parameters
      many_channel_id: id,
			many_channel_url: url,
      many_channel_range: range,
      many_channel_color: color.map(c => c / 255.),
			// Standard parameters
			tileSize: 1024,
			height: 4080,
			width: 7220,
			minLevel: 0,
			maxLevel: 3
    }
  }

  makeTileSources(ids) {
    return ids.map(this.makeTileSource, this)
              .filter(s => s !== undefined);
  }

  getTiledImageById(id) {
    if (this.viewer !== undefined) {
      const {world} = this.viewer;

      for (var i = 0; i < world.getItemCount(); i++) {
        const tiledImage = world.getItemAt(i);
        const {many_channel_id} = tiledImage.source;

        if (id == many_channel_id)
          return tiledImage;
      }
    }
    return undefined;
  }

  loseChannels(ids) {
    if (this.viewer !== undefined) {
      const {world} = this.viewer;
      var tiledImages = ids.map(this.getTiledImageById, this);
      tiledImages = tiledImages.filter(i=>i !== undefined);
      tiledImages.map(world.removeItem, world);
    }
  }

  redrawChannels(ids) {
    if (this.viewer !== undefined) {
      const {world} = this.viewer;
      const {channels} = this.props;

      ids.forEach((id) => {
        let channel = channels.get(id);
        if (channel === undefined) {
          return;
        }
        let {color, range} = channel;
        let tiledImage = this.getTiledImageById(id);
        if (tiledImage !== undefined) {
          tiledImage._needsDraw = true;
          let {source} = tiledImage;
          source.many_channel_color = color.map(c => c / 255.);
          source.many_channel_range = range;
        }
      })
    }
  }

  gainChannels(ids) {
    const {viewer} = this;
    if (viewer !== undefined) {
      const tileSources = this.makeTileSources(ids);
      tileSources.forEach(tileSource => {
        viewer.addTiledImage({
          tileSource: tileSource
        });
      });
    }
  }

  /**
    * @returns Object - channels to lose, gain, update
    */
  getChanges() {
    const img = {...this.props.img};
    const imgCache = {...this.cache.img};
    const channels = new Map(this.props.channels);
    const channelsCache = new Map(this.cache.channels);
    // Actually update the cache
    this.cache = {
      channels: channels,
      img: img
    };

    // derived properties
    const uuid = '' + img.uuid;
    const uuidCache = '' + imgCache.uuid;
    const ids = new Set(channels.keys());
    const idsCache = new Set(channels.keys());

    // Update the whole image
    if (uuidCache != uuid) {
      return {
        lost: [...idsCache],
        gained: [...ids],
        redrawn: []
      };
    }

    // Lose or Gain ids that differ, update those that intersect

    const redrawn = intersectSet(ids, idsCache);
    const gained = differSet(ids, idsCache);
    const lost = differSet(idsCache, ids);

    // Check if really need to update
    if (!lost.size && !gained.size) {
      

    }

    return {
      redrawn: redrawn,
      gained: gained,
      lost: lost,
    };
  }

  shouldComponentUpdate() {
    this.changes = this.getChanges()
    const {changes} = this;
    if (!Object.keys(changes).length) {
      return false;
    }
    return true;
  }

  componentDidMount() {
    const {channels, img} = this.props;
    const ids = [...channels.keys()];

    // Update the cache
    this.getChanges();

    // Set up openseadragon viewer
    this.viewer = viaWebGL.OpenSeadragon({
      debugMode: false,
      collectionMode: true,
      showZoomControl: false,
      showHomeControl: false,
      loadTilesWithAjax: true,
      showFullPageControl: false,
      // Specific to this project
      id: "ImageView",
      collectionRows: 1,
      collectionTileSize: 1,
      collectionTileMargin: -1,
      compositeOperation: "lighter",
      prefixUrl: "images/openseadragon/",
      // Intiial image channels
      tileSources: this.makeTileSources(ids)
    });

    // Define interface to shaders
    const seaGL = new viaWebGL.openSeadragonGL(this.viewer);
    seaGL.vShader = 'vert.glsl';
    seaGL.fShader = 'frag.glsl';

    seaGL.addHandler('tile-drawing',  function(callback, e) {
			// Read parameters from each tile 
			const tile = e.tile;
			const via = this.viaGL;
			const viewer = this.openSD;
			const image = e.tiledImage;
			const source = image.source;

			// Store channel color and range to send to shader
			via.color_3fv = new Float32Array(source.many_channel_color);
			via.range_2fv = new Float32Array(source.many_channel_range);
	 
			// Start webGL rendering
			callback(e);
  	});

    seaGL.addHandler('gl-drawing', function() {
			// Send color and range to shader
			this.gl.uniform3fv(this.u_tile_color, this.color_3fv);
			this.gl.uniform2fv(this.u_tile_range, this.range_2fv);

			// Clear before each draw call
			this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  	});

    seaGL.addHandler('gl-loaded', function(program) {
			// Turn on additive blending
			this.gl.enable(this.gl.BLEND);
			this.gl.blendEquation(this.gl.FUNC_ADD);
			this.gl.blendFunc(this.gl.ONE, this.gl.ONE);

			// Uniform variable for coloring
			this.u_tile_color = this.gl.getUniformLocation(program, 'u_tile_color');
			this.u_tile_range = this.gl.getUniformLocation(program, 'u_tile_range');
		});

		seaGL.addHandler('tile-loaded', (callback, e) => callback(e));

    seaGL.init();
  }

  render() {
    const {changes} = this;
    const {img, channels} = this.props;
    const entries = channels.entries();

    var {redrawn, gained, lost} = changes;

    // TODO why need set operations here?
    const ids = new Set(channels.keys());
    this.redrawChannels(intersectSet(ids, new Set(redrawn)));
    this.gainChannels(intersectSet(ids, new Set(gained)));
    this.loseChannels(differSet(new Set(lost), ids));

    return (
      <div id="ImageView"></div>
    );
  }
}

export default ImageView;