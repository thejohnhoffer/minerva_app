import React, { Component } from "react";
import CreatableSelect from 'react-select/creatable';

import MinervaImageView from "./minervaimageview";
import SimpleImageView from "./simpleimageview";
import FileBrowserModal from "../components/filebrowsermodal";
import Modal from "../components/modal";
import ImageView from "./imageview";
import Controls from "./controls";
import { handleFetchErrors } from "./app";
import { Confirm } from 'semantic-ui-react';
import ClipLoader from "react-spinners/ClipLoader";
import { Progress, Popup } from 'semantic-ui-react'
import Client from '../MinervaClient';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExclamationCircle, faWindowClose, faShare, faSave, faEye, faBullhorn } from "@fortawesome/free-solid-svg-icons";

import '../style/repo'
import PublishStoryModal from "../components/publishstorymodal";

const validNameRegex = /^([a-zA-Z0-9 _-]+)$/;

const randInt = n => Math.floor(Math.random() * n);
const randColor = () => {
  return [
    [0,0,255],[0,127,255],[0,255,0],[0,255,127],[0,255,255],
    [127,0,255],[127,127,127],[127,127,255],[127,255,0],[127,255,127],
    [255,0,0],[255,0,127],[255,0,255],[255,127,0],[255,127,127],[255,255,0]
  ][randInt(16)]
}

const normalize = (viewer, pixels) => {
  const vp = viewer.viewport;
  const norm = vp.viewerElementToViewportCoordinates;
  return norm.call(vp, pixels);
}

const IntToHex = c => {
  var hex = c.toString(16);
  return hex.length == 1 ? "0" + hex : hex;
}

const rgbToHex = rgb => {
  const [r, g, b] = rgb;
  return IntToHex(r) + IntToHex(g) + IntToHex(b);
}

const hexToRgb = hex => {
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function(m, r, g, b) {
    return r + r + g + g + b + b;
  });

  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
   	parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

class Repo extends Component {

  constructor(props) {
    super();

    const { width, height, maxLevel, tilesize,
      rgba, uuid, url, warning} = props;
    const { channels, sample_info, waypoints, groups, masks} = props;

		const defaultChanRender = new Map(channels.map((v,k) => {
			return [k, {
				maxRange: 65535,
				value: k, id: k,
				color: randColor(),
				range: {min: 0, max: 32768},
        visible: true
			}];
    }));

		this.state = {
      error: null,
      isMaskMapLoading: false,
      invalidMaskMap: false,
      warning: warning,
      showFileBrowser: false,
      showVisDataBrowser: false,
      showMaskBrowser: false,
      showMaskMapBrowser: false,
      rotation: sample_info.rotation,
      sampleName: sample_info.name,
      sampleText: sample_info.text,
      drawType: '',
      drawing: 0,
			img: {
          uuid: uuid,
          width: width,
          height: height,
          maxLevel: maxLevel,
          tilesize: tilesize,
					url: url 
      },
      imageName: props.imageName,
      rgba: rgba,
      textEdit: false,
      showModal: false,
      sampleInfo: false,
      renameModal: false,
      addGroupModal: false,
      needNewGroup: false,
			activeArrow: 0,
      viewport: null,
      activeStory: 0,
      activeVisLabel: {
        value: -1, id: -1, label: '', colormapInvert: false,
        data: '', x: '', y: '', cluster: -1, clusters: new Map([])
      },
      deleteGroupModal: false,
      deleteStoryModal: false,
      deleteClusterModal: false,
      deleteMaskModal: false,
      saving: false,
      published: false,
      publishing: false,
      showPublishStoryModal: false,
      rangeSliderComplete: true,
      saveProgress: 0,
      saveProgressMax: 0,
      publishProgress: 0,
      publishProgressMax: 0,
      storyMasksTempCache: new Map(), 
      stories: new Map(waypoints.map((v,k) => {
				let wp = {
					'name': v.name,
        	'text': v.text,
        	'pan': v.pan,
        	'zoom': v.zoom,
          'masks': v.masks.filter(i => i < masks.length),
        	'arrows': v.arrows,
        	'overlays': v.overlays,
        	'group': groups.findIndex(g => {
						return g.label == v.group;
					}),
          'visLabels': new Map([
          [0, {value: 0, id: 0, label: 'VisScatterplot', colormapInvert: false,
                data: '', x: '', y: '', cluster: -1, clusters: new Map([])
                }],
            [1, {value: 1, id: 1, label: 'VisCanvasScatterplot', colormapInvert: false,
                data: '', x: '', y: '', cluster: -1, clusters: new Map([])
                }],
            [2, {value: 2, id: 2, label: 'VisMatrix', colormapInvert: false,
                data: '', x: '', y: '', cluster: -1, clusters: new Map([])
                }],
            [3, {value: 3, id: 3, label: 'VisBarChart', colormapInvert: false,
                data: '', x: '', y: '', cluster: -1, clusters: new Map([])
                }]
          ])
				};
        ['VisScatterplot', 'VisCanvasScatterplot', 'VisMatrix', 'VisBarChart'].forEach((label, index) => {
          if (v[label]) {
            if (index < 2) {
              let clusters = v[label].clusters;
              wp.visLabels.get(index).data = v[label].data;
              wp.visLabels.get(index).x = v[label].axes.x;
              wp.visLabels.get(index).y = v[label].axes.y;
              wp.visLabels.get(index).clusters = new Map(clusters.labels.split(',').map((l, i) => {
                return [i, {
                  name: l,
                  color: hexToRgb(clusters.colors.split(',')[i])
                }]
              }))
              if (wp.visLabels.get(index).clusters.size) {
                wp.visLabels.get(index).cluster = 0;
              }
            }
            else if (index == 2) {
              wp.visLabels.get(index).data = v[label].data;
              wp.visLabels.get(index).colormapInvert = v[label].colormapInvert;
            }
            else {
              wp.visLabels.get(index).data = v[label];
            }
          }
        });
        return [k, wp]
      })),
      activeGroup: 0,
      storyUuid: props.storyUuid,
      activeGroup: 0,
      maskPathStatus: new Map(),
      activeMaskId: masks.length? 0 : -1,
      masks: new Map(masks.map((v,k) => {
        const chan0 = v.channels[0];
        const mask = {
          path: v.path,
          name: v.label,
          cache_name: v.original_label || "",
          map_path: v.map_path || "",
          map_ids: chan0.ids || [],
          color: hexToRgb(chan0.color)
        }
        return [k, mask];
      })),
      groups: new Map(groups.map((v,k) => {
				return [k, {
					activeIds: v.channels.map(chan => {
						return chan.id;
					}),
					chanRender: new Map([...defaultChanRender,
					...new Map(v.channels.map(chan => {
						return [chan.id, {
							color: hexToRgb(chan.color),
							range: {
								min: chan.min * 65535, 
								max: chan.max * 65535
							},
							maxRange: 65535,
							value: chan.id, id: chan.id,
              visible: true
						}]
					}))]),
					label: v.label,
					value: k
				}]
			})),
      activeIds: channels.length < 2 ? [0] : [0, 1],
      chanLabel: new Map(channels.map((v,k) => {
        return [k, {
          value: k, id: k,
          label: v,
        }];
      })),
      chanRender: defaultChanRender
    };

    if (this.state.stories.size == 0) {
      this.state.stories = new Map([
        [0, this.defaultStory()]
      ])
    }
    if (this.state.groups.size > 0) {
      this.state.activeIds = this.state.groups.get(0).activeIds;
    }
    if (props.story) {
      this.state.authorName = props.story.author_name;
    }

    this.filePath = React.createRef();
    // Bind
    this.dismissWarning = this.dismissWarning.bind(this);
    this.updateGroups = this.updateGroups.bind(this);
    this.openFileBrowser = this.openFileBrowser.bind(this);
    this.onFileSelected = this.onFileSelected.bind(this);
    this.openVisDataBrowser = this.openVisDataBrowser.bind(this);
    this.onVisDataSelected = this.onVisDataSelected.bind(this);
    this.interactor = this.interactor.bind(this);
    this.arrowClick = this.arrowClick.bind(this);
    this.lassoClick = this.lassoClick.bind(this);
    this.deleteArrow = this.deleteArrow.bind(this);
    this.deleteOverlay = this.deleteOverlay.bind(this);
    this.addArrowText = this.addArrowText.bind(this);
    this.boxClick = this.boxClick.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleSelect = this.handleSelect.bind(this);
    this.handleSelectStory = this.handleSelectStory.bind(this);
    this.handleSelectStoryMasks = this.handleSelectStoryMasks.bind(this);
    this.handleConcatStoryMasks = this.handleConcatStoryMasks.bind(this);
    this.handleSelectVis = this.handleSelectVis.bind(this);
    this.handleStoryName = this.handleStoryName.bind(this);
    this.handleStoryText = this.handleStoryText.bind(this);
    this.handleArrowText = this.handleArrowText.bind(this);
    this.handleSampleText = this.handleSampleText.bind(this);
    this.handleSampleName = this.handleSampleName.bind(this);
    this.handleRotation = this.handleRotation.bind(this);
    this.handleArrowHide = this.handleArrowHide.bind(this);
    this.handleArrowAngle = this.handleArrowAngle.bind(this);
    this.handleStoryChange = this.handleStoryChange.bind(this);
    this.handleClusterChange = this.handleClusterChange.bind(this);
    this.handleClusterInsert = this.handleClusterInsert.bind(this);
    this.handleClusterRemove = this.handleClusterRemove.bind(this);
    this.handleStoryInsert = this.handleStoryInsert.bind(this);
    this.handleStoryRemove = this.handleStoryRemove.bind(this);
    this.handleAuthorName = this.handleAuthorName.bind(this);
    this.deleteStory = this.deleteStory.bind(this);
    this.deleteCluster = this.deleteCluster.bind(this);
    this.handleSelectGroup = this.handleSelectGroup.bind(this);
    this.handleViewport = this.handleViewport.bind(this);
    this.toggleTextEdit = this.toggleTextEdit.bind(this);
    this.toggleSampleInfo = this.toggleSampleInfo.bind(this);
    this.submitSampleInfo = this.submitSampleInfo.bind(this);
    this.toggleModal = this.toggleModal.bind(this);
    this.save = this.save.bind(this);
    this.share = this.share.bind(this);
    this.publish = this.publish.bind(this);
    this.deleteActiveGroup = this.deleteActiveGroup.bind(this);
    this.showRenameModal = this.showRenameModal.bind(this);
    this.showAddGroupModal = this.showAddGroupModal.bind(this);
    this.handleGroupRename = this.handleGroupRename.bind(this);
    this.handleAddGroup = this.handleAddGroup.bind(this);
    this.getCreateLabel = this.getCreateLabel.bind(this);
    this.labelRGBA = this.labelRGBA.bind(this);
    this.defaultStory = this.defaultStory.bind(this);
    this.handleUpdateAllMasks = this.handleUpdateAllMasks.bind(this);
    this.handleUpdateMask = this.handleUpdateMask.bind(this);
    this.handleMaskChange = this.handleMaskChange.bind(this);
    this.handleMaskInsert = this.handleMaskInsert.bind(this);
    this.handleMaskRemove = this.handleMaskRemove.bind(this);
    this.deleteMask = this.deleteMask.bind(this);
    this.openMaskBrowser = this.openMaskBrowser.bind(this);
    this.onMaskSelected = this.onMaskSelected.bind(this);
    this.openMaskMapBrowser = this.openMaskMapBrowser.bind(this);
    this.onMaskMapSelected = this.onMaskMapSelected.bind(this);
  }

  defaultStory() {
    const {stories, activeStory, activeGroup, viewport} = this.state;

    return {
      text: '',
      name: '',
      masks: [],
      arrows: [],
      overlays: [],
      group: activeGroup,
      pan: [
        viewport? viewport.getCenter().x: 0.5,
        viewport? viewport.getCenter().y: 0.5,
      ],
      zoom: viewport? viewport.getZoom(): 1.0,
      visLabels: new Map([
        [0, {value: 0, id: 0, label: 'VisScatterplot', colormapInvert: false,
            data: '', x: '', y: '', cluster: -1, clusters: new Map([])
            }],
        [1, {value: 1, id: 1, label: 'VisCanvasScatterplot', colormapInvert: false,
            data: '', x: '', y: '', cluster: -1, clusters: new Map([])
            }],
        [2, {value: 2, id: 2, label: 'VisMatrix', colormapInvert: false,
            data: '', x: '', y: '', cluster: -1, clusters: new Map([])
            }],
        [3, {value: 3, id: 3, label: 'VisBarChart', colormapInvert: false,
            data: '', x: '', y: '', cluster: -1, clusters: new Map([])
            }]
      ])
    };
  }

  componentDidMount() {
    this.labelRGBA();
    this.setMaskPathStatusPolling(true);
  }

  componentWillUnmount() {
    this.setMaskPathStatusPolling(false);
  }

  labelRGBA() {
    const {rgba} = this.state;
    if (rgba) {
      this.setState({
        activeGroup: 0,
        groups: new Map([
          [0, {
            value: 0,
            label: 'H&E',
            activeIds: [0, 1],
            chanRender: new Map([
              [0, {
                id: 0,
                value: 0,
                color: [128, 0, 128],
                range: {
                  min: 0,
                  max: 65535
                },
                maxRange: 65535,
                visible: true
              }],
              [1, {
                id: 1,
                value: 1,
                color: [255, 0, 255],
                range: {
                  min: 0,
                  max: 65535
                },
                maxRange: 65535,
                visible: true
              }],
            ])
          }]
        ]),
        activeIds: [0, 1],
        chanLabel: new Map([
          [0, {
            id: 0,
            value: 0,
            label: 'Hematoxylin'
          }],
          [1, {
            id: 1,
            value: 1,
            label: 'Eosin'
          }]
        ])
      })    
    }
  }

  handleViewport(viewport) {
    const {stories, activeStory, activeGroup} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();

    newStory.zoom = viewport.getZoom();
    newStory.pan = [
        viewport.getCenter().x,
        viewport.getCenter().y
    ];

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({viewport: viewport});
    if (this.state.textEdit) {
      this.setState({stories: newStories});
    }
  }

  handleStoryChange(newActiveStory) {
    const {groups, stories, viewport} = this.state;
    const newStory = stories.get(newActiveStory) || this.defaultStory();
    if (newStory && viewport) {
        const pan = new OpenSeadragon.Point(...newStory.pan);
        viewport.zoomTo(newStory.zoom); 
        viewport.panTo(pan); 
    }
    this.setState({
      activeStory: newActiveStory,
      activeVisLabel: {
        value: -1, id: -1, label: '', colormapInvert: false,
        data: '', x: '', y: '', cluster: -1, clusters: new Map([])
      }
    })
    if (newStory) {
      const group = groups.get(newStory.group)
      if (group) {
        this.setState({
          activeGroup: newStory.group,
          activeIds: group.activeIds
        })
      }
    }
  }

  handleClusterRemove() {

    const {activeVisLabel} = this.state;
    const c = activeVisLabel.clusters.get(activeVisLabel.cluster);
    if (c === undefined) {
      this.deleteCluster();
    }
    else {
      this.setState({deleteClusterModal: true})
    }

  }

  deleteCluster() {

    let newLabel = this.state.activeVisLabel;
    let newStory = this.state.stories.get(this.state.activeStory) || this.defaultStory();

    const newClusters = new Map([...newLabel.clusters].filter(([k,v]) => {
                                return k != newLabel.cluster;
                              }).map(([k,v])=>{
                                return [k < newLabel.cluster? k : k - 1, v]
                              }))

    newLabel.clusters = newClusters;
    newLabel.cluster = Math.max(0, newLabel.cluster - 1);
    if (newClusters.size == 0) {
      newLabel.cluster = -1;
    }

    newStory.visLabels = new Map([...newStory.visLabels,
                    ...(new Map([[newLabel.id, newLabel]]))]);

    this.setState({
      activeVisLabel: newLabel,
      stories: new Map([...this.state.stories,
        ...(new Map([[this.state.activeStory, newStory]]))])
    });
    this.setState({deleteClusterModal: false});
  }

  handleClusterInsert() {
    let newLabel = this.state.activeVisLabel;
    let newStory = this.state.stories.get(this.state.activeStory) || this.defaultStory();
    newLabel.cluster = newLabel.cluster + 1;

    const newCluster = {
      name: (newLabel.cluster + 1),
			color: hexToRgb("#FFFFFF"),
    };

    const newClusters = new Map([...[...newLabel.clusters].map(([k,v]) => {
                                return [k < newLabel.cluster? k: k+1, v];
                              }),
                              ...(new Map([[newLabel.cluster, newCluster]]))]);

    const sortedClusters = new Map([...newClusters.entries()].sort((e1, e2) => e1[0] - e2[0]));

    newLabel.clusters = sortedClusters;
    newStory.visLabels = new Map([...newStory.visLabels,
                    ...(new Map([[newLabel.id, newLabel]]))]);

    this.setState({
      activeVisLabel: newLabel,
      stories: new Map([...this.state.stories,
        ...(new Map([[this.state.activeStory, newStory]]))])
    })
  }


  handleStoryRemove() {

    const {stories, activeStory} = this.state;
    const story = stories.get(activeStory);
    if (story === undefined) {
      this.deleteStory();
    }
    else {
      this.setState({deleteStoryModal: true})
    }

  }

  deleteStory() {

    const {stories, storyMasksTempCache, activeStory} = this.state;

    // Reassign indices to active and cached stories

    let newStories = new Map([...stories].filter(([k,v]) => {
                                return k != activeStory;
                              }).map(([k,v])=>{
                                return [k < activeStory? k : k - 1, v]
                              }))

    let newStoryMasksTempCache = new Map([...storyMasksTempCache].filter(([k,v]) => {
                                return k != activeStory;
                              }).map(([k,v])=>{
                                return [k < activeStory? k : k - 1, v]
                              }))

    let newActiveStory = Math.max(0, activeStory - 1);
    if (newStories.size == 0) {
      newStories.set(0, this.defaultStory())
    }
    this.setState({
      stories: newStories,
      storyMasksTempCache: newStoryMasksTempCache,
      activeStory: newActiveStory,
      activeVisLabel: {
        value: -1, id: -1, label: '', colormapInvert: false,
        data: '', x: '', y: '', cluster: -1, clusters: new Map([])
      }
    });
    this.setState({deleteStoryModal: false})
  }

  handleStoryInsert() {
    const {stories, storyMasksTempCache, activeStory, activeGroup, viewport} = this.state;
    const newStory = this.defaultStory();

    // Reassign indices to active and cached stories

    const newStories = new Map([...[...stories].map(([k,v]) => {
                                return [k <= activeStory? k: k+1, v];
                              }),
                              ...(new Map([[activeStory + 1, newStory]]))]);

    const newStoryMasksTempCache = new Map([...storyMasksTempCache].map(([k,v]) => {
                                return [k <= activeStory? k: k+1, v];
                              }));

    const sortedStories = new Map([...newStories.entries()].sort((e1, e2) => e1[0] - e2[0]));

    this.setState({
      stories: sortedStories,
      storyMasksTempCache: newStoryMasksTempCache,
      activeStory: activeStory + 1,
      activeVisLabel: {
        value: -1, id: -1, label: '', colormapInvert: false,
        data: '', x: '', y: '', cluster: -1, clusters: new Map([])
      }
    });
  }

  handleStoryName(event) {
    const {stories, activeStory, activeGroup, viewport} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();
    newStory.name = event.target.value;

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({stories: newStories});
  }

  handleStoryText(event) {
    const {stories, activeStory, activeGroup, viewport} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();
    newStory.text = event.target.value;

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({stories: newStories});
  }

	toggleModal() {
	  this.setState({
      showModal: !this.state.showModal
    });
	}

  updateGroups(groups) {
    const maxChan = this.state.chanLabel.size - 1;
    let extraChan = false;

    const g = new Map(groups.map((v,k) => {
			return [k, {
				activeIds: v.channels.map(chan => {
          if (chan.id > maxChan) {
            extraChan = true;
          }
					return chan.id;
				}),
				chanRender: new Map([...this.state.chanRender,
				...new Map(v.channels.map(chan => {
					return [chan.id, {
						color: hexToRgb(chan.color),
						range: {
							min: chan.min * 65535, 
							max: chan.max * 65535
						},
						maxRange: 65535,
						value: chan.id, id: chan.id,
            visible: true
					}]
				}))]),
				label: v.label,
				value: k
			}]
		}))
    if (extraChan) {
      this.setState({
        error: 'Unsupported case of dat file with excess channels'
      })
    }
    else {
      this.setState({
        groups: g
      })
    }
  }

	submitSampleInfo() {
    fetch('http://127.0.0.1:2020/api/import/groups', {
      method: 'POST',
      body: JSON.stringify({
        'filepath': this.filePath.current.value
      }),
      headers: {
        "Content-Type": "application/json"
      }
    }).then(response => {
      if (response.ok) {
        return response.json();
      }
      else if (response.status == 404){
        this.setState({
          error: 'Imported json file is not found.'
        })
        return null;
      }
      else {
        this.setState({
          error: 'Imported json file is invalid.'
        })
        return null;
      }
    }).then(data => {
      if (data) {
        this.updateGroups(data.groups);
      }
    });
	}

	toggleSampleInfo() {
	  this.setState({
      sampleInfo: !this.state.sampleInfo
    });
    const filePath = this.filePath.current ? this.filePath.current.value : false;
    if (this.state.sampleInfo && !!filePath) {
      this.submitSampleInfo();
    }
	}

  toggleTextEdit(value) {
    const {textEdit, activeStory} = this.state;
    this.setState({
      textEdit: value,
      publishProgress: 0,
      publishProgressMax: 0
    })
    if (!textEdit) {
      this.handleStoryChange(activeStory);
    }
  }

  showAddGroupModal() {
    this.setState({ needNewGroup: !this.state.addGroupModal});
    this.setState({ addGroupModal: !this.state.addGroupModal});
  }

  showRenameModal() {
    this.setState({ renameModal: !this.state.renameModal});
  }

  validateChannelGroupLabel(label) {
    const {groups} = this.state;
    const is_valid = label && validNameRegex.test(label);
    const is_unique = Array.from(groups).map(([key, group]) => {
      return group.label;
    }).indexOf(label) == -1;
    return is_valid && is_unique;
  }

  handleAddGroup(evt) {
    if (!this.validateChannelGroupLabel(evt.target.value)) {
      this.setState({invalidChannelGroupName: true});
      return;
    }
    this.setState({invalidChannelGroupName: false});
    let groups = this.state.groups;
    if (this.state.needNewGroup) {
      const id = groups.size;
      const newGroup = {
        chanRender: this.state.chanRender,
        activeIds: this.state.activeIds,
        label: evt.target.value,
        value: id
      }

      const newGroups = new Map([...groups,
                                ...(new Map([[id, newGroup]]))]);

      this.setState({
        needNewGroup: false,
        groups: newGroups,
        activeGroup: id
      });
    }
    else {
      this.handleGroupRename(evt);
    }
  }

  handleGroupRename(evt) {
    if (!this.validateChannelGroupLabel(evt.target.value)) {
      this.setState({invalidChannelGroupName: true});
      return;
    }
    this.setState({invalidChannelGroupName: false});

    let group = this.state.groups.get(this.state.activeGroup);
    let newGroups = new Map(this.state.groups);
    group.label = evt.target.value;
    newGroups.set(this.state.activeGroup, group);
    this.setState({groups: newGroups});
  }

  deleteActiveGroup() {
    this.state.groups.delete(this.state.activeGroup);
    const newGroups = new Map();
    // All groups that come after the deleted group, must have their
    // indexes reduced by one, so that there are no gaps.
    for (let [key, value] of this.state.groups.entries()) {
      if (key > this.state.activeGroup) {
        key--;
        value.value--;
      }
      newGroups.set(key, value);
    }
    let newActiveGroup = this.state.activeGroup - 1;
    if (newActiveGroup < 0) {
      newActiveGroup = 0;
    }
    let selectedGroup = newGroups.get(newActiveGroup);
    let newActiveIds = selectedGroup ? selectedGroup.activeIds : [0, 1];
    this.setState({groups: newGroups, 
      activeGroup: newActiveGroup,
      deleteGroupModal: false,
      activeIds: newActiveIds });
  }

  handleSelectStory(s) {
    this.handleStoryChange(s.value);
  }

  handleSelectVis(v, data=null, x=null, y=null, colormapInvert=null, clusters=new Map([])) {
    let newStory = this.state.stories.get(this.state.activeStory) || this.defaultStory();
    const newLabel = {
      colormapInvert: colormapInvert != null ? colormapInvert : v.colormapInvert,
      clusters: clusters? new Map([...v.clusters, ...clusters]) : v.clusters,
      cluster: clusters.size ? clusters.keys().next().value : v.cluster,
      id: v.id, value: v.value, label: v.label,
      data: data != null ? data : v.data,
      x: x != null ? x : v.x,
      y: y != null ? y : v.y
    }
    newStory.visLabels = new Map([...newStory.visLabels,
                    ...(new Map([[newLabel.id, newLabel]]))]);
    this.setState({
      activeVisLabel: newLabel,
      stories: new Map([...this.state.stories,
        ...(new Map([[this.state.activeStory, newStory]]))])
    })
  }

  handleClusterChange(cluster) {
    let newStory = this.state.stories.get(this.state.activeStory) || this.defaultStory();
    let newLabel = this.state.activeVisLabel;
    if (newLabel.clusters.get(cluster)) {
      newLabel.cluster = cluster;
      newStory.visLabels = new Map([...newStory.visLabels,
                      ...(new Map([[newLabel.id, newLabel]]))]);
      this.setState({
        activeVisLabel: newLabel,
        stories: new Map([...this.state.stories,
          ...(new Map([[this.state.activeStory, newStory]]))])
      })
    }
}

  handleUpdateAllMasks(newMask) {
    this.setState({
      masks: new Map([...this.state.masks].map(([a, b]) => {
        return [a, {
          ...b,
          ...newMask
        }];
      }))
    })
  }

  handleUpdateMask(newMask, clear=false) {
    const maskId = clear? 0 : Math.max(0, this.state.activeMaskId);
    let activeMask = this.state.masks.get(maskId);

    if (activeMask === undefined) {
      activeMask = {
        cache_name: "",
        name: ""+(maskId+1),
        color: [255, 255, 255],
        map_ids: [],
        map_path: "",
        path: ""
      };
    };

    newMask = {
      ...activeMask,
      ...newMask
    };

    if (clear) {
      const storyMasksTempCache = new Map();
      [...this.state.stories].forEach(([s_id, story]) => {
        // Remove the masks from the actual stories, only to save the names in the cache
        if (this.state.masks.size > 1) {
          const cache_masks = story.masks.map(m=>this.state.masks.get(m)).filter(mask=> {
            return mask.cache_name && mask.map_ids && mask.map_ids.length > 0;
          });
          const cache_names = cache_masks.map(mask => mask.cache_name);
          if (cache_names.length > 0) {
            storyMasksTempCache.set(s_id, cache_names);
          }
          this.handleSelectStoryMasks(story.masks.includes(0) ? [{id:0}] : [], {s_id});
        }
      });
      if (storyMasksTempCache.size > 0) {
        this.setState({
          storyMasksTempCache
        });
      }
    }
 
    this.setState({
      activeMaskId: maskId,
      masks: new Map([...(clear? new Map(): this.state.masks),
                ...(new Map([[maskId, newMask]]))])
    })
  }

  handleMaskChange(maskId) {
    this.setState({
      activeMaskId: maskId
    })
  }

  handleMaskInsert(attributes={}) {
    let {stories} = this.state;
    let activeMaskId = this.state.activeMaskId + 1;
    let activeMask = this.state.masks.get(activeMaskId - 1);

    if (activeMask === undefined) {
      activeMask = {
        map_ids: [],
        map_path: "",
        path: ""
      };
    }

    const newMask = {
      ...activeMask,
      color: [255, 255, 255],
      name: ""+(activeMaskId+1),
      cache_name: "",
      ...attributes
    };
    
    const newMasks = new Map([...[...this.state.masks].map(([k,v]) => {
                                return [k < activeMaskId? k: k+1, v];
                              }),
                              ...(new Map([[activeMaskId, newMask]]))]);

    const sortedMasks = new Map([...newMasks.entries()].sort((e1, e2) => e1[0] - e2[0]));

    // Update story mask array with new ids
    stories.forEach((story) => {
      story.masks = story.masks.map((k) => {
        return k < activeMaskId? k : k + 1;
      })
    })

    this.setState({
      activeMaskId: activeMaskId,
      masks: sortedMasks,
      stories: stories
    })
  }

  handleMaskRemove() {

    const {activeMaskId} = this.state;
    const m = this.state.masks.get(activeMaskId);
    if (m === undefined) {
      this.deleteMask();
    }
    else {
      this.setState({deleteMaskModal: true})
    }

  }

  deleteMask() {

    const {stories, masks, activeMaskId} = this.state;

    const newMasks = new Map([...masks].filter(([k,v]) => {
                                return k != activeMaskId;
                              }).map(([k,v])=>{
                                return [k < activeMaskId? k : k - 1, v]
                              }))

    // Update story mask array with new ids
    stories.forEach((story) => {
      story.masks = story.masks.filter((k) => {
        return k != activeMaskId;
      }).map((k) => {
        return k < activeMaskId? k : k - 1;
      })
    })

    let newMaskId = Math.max(0, activeMaskId - 1);
    if (newMasks.size == 0) {
      newMaskId = -1;
    }

    this.setState({
      activeMaskId: newMaskId,
      masks: newMasks,
      stories: stories
    });
    this.setState({deleteMaskModal: false});
  }


  handleSelectGroup(g, action) {
    if (action.action === 'clear') {
      this.setState({deleteGroupModal: true});
      return;
    }

    const id = this._handleSelectGroupForEditing(g);
    this._handleSelectGroupForWaypoint(id);
  }

  _handleSelectGroupForWaypoint(id) {
    const {activeStory, textEdit, viewport} = this.state;
    let newStory = this.state.stories.get(activeStory) || this.defaultStory();
    if ((id !== undefined) && textEdit) {

      newStory.group = id;

      const newStories = new Map([...this.state.stories,
        ...(new Map([[activeStory, newStory]]))]);
      this.setState({ stories: newStories});
    }
  }

  _handleSelectGroupForEditing(g) {
    let groups = this.state.groups;
    if (g.__isNew__) {
      if (!this.validateChannelGroupLabel(g.label)) {
        return undefined;
      }
      const id = groups.size;
      const newGroup = {
        chanRender: this.state.chanRender,
        activeIds: this.state.activeIds,
        label: g.label,
        value: id
      }

      const newGroups = new Map([...groups,
                                ...(new Map([[id, newGroup]]))]);

      this.setState({
        groups: newGroups,
        activeGroup: id
      });
      return id;
    }
    else {
      this.setState({
        activeGroup: g.value,
        activeIds: g.activeIds
      });
      return g.value;
    }
    return true;
  }

  handleSelect(channels) {
    const {groups, activeGroup} = this.state;
    const channelArray = channels? channels : [];
    const activeIds = channelArray.map(c => c.id);

    const group = groups.get(activeGroup);

    this.setState({
      activeIds
    })

    if (group) {
      const newGroup = {
        chanRender: group.chanRender, 
        activeIds: activeIds,
        label: group.label,
        value: group.value
      }

      const newGroups = new Map([...groups,
                                ...(new Map([[activeGroup, newGroup]]))]);

      this.setState({
        groups: newGroups
      })
    }
  }

  handleConcatStoryMasks(masks, params) {
    const {stories} = this.state;
    const maskArray = masks? masks : [];
    const activeStory = 's_id' in params ? params.s_id : this.state.activeStory;
    const newStory = stories.get(activeStory) || this.defaultStory();

    this.handleSelectStoryMasks(
      newStory.masks.map((id) => {
        return {id: id};
      }).concat(maskArray), params
    )
  }

  handleSelectStoryMasks(masks, params) {
    const {stories} = this.state;
    const maskArray = masks? masks : [];
    const activeStory = 's_id' in params ? params.s_id : this.state.activeStory;
    const newStory = stories.get(activeStory) || this.defaultStory();

    newStory.masks = maskArray.map(c => c.id);

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({
      stories: newStories
    })
  }

  computeBounds(value, start, len) {
    const center = start + (len / 2);
    const end = start + len;
    // Below center
    if (value < center) {
      return {
        start: value,
        range: end - value,
      };
    }
    // Above center
    return {
      start: start,
      range: value - start,
    };
  }

  handleArrowAngle(event) {

    const {stories, activeStory, activeGroup, viewport} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();
		const activeArrow = this.state.activeArrow;

		if (newStory.arrows.length - 1 < activeArrow) {
			return;
		}

    let angle = parseInt(event.target.value)
    newStory.arrows[activeArrow].angle = isNaN(angle) ? '' : angle; 

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({
      stories: newStories
    })
  }

  handleArrowHide() {

    const {stories, activeStory, activeGroup, viewport} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();
		const activeArrow = this.state.activeArrow;

		if (newStory.arrows.length - 1 < activeArrow) {
			return;
		}

		newStory.arrows[activeArrow].hide = !newStory.arrows[activeArrow].hide;

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({
      stories: newStories
    })
  }

  handleRotation(event) {
    let angle = parseInt(event.target.value)
    angle = isNaN(angle) ? 0 : angle; 

    this.setState({
      rotation: angle
    })
  }

  handleSampleName(event) {
    this.setState({
      sampleName: event.target.value
    })
  }

  handleSampleText(event) {
    this.setState({
      sampleText: event.target.value
    })
  }

  handleAuthorName(event) {
    this.setState({
      authorName: event.target.value
    });
  }

  handleArrowText(event) {

    const {stories, activeStory, activeGroup, viewport} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();
		const activeArrow = this.state.activeArrow;

		if (newStory.arrows.length - 1 < activeArrow) {
			return;
		}

		newStory.arrows[activeArrow].text = event.target.value;

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({
      stories: newStories
    })
  }

  drawArrow(position) {
    const new_xy = [
      position.x, position.y
    ];

    const {stories, activeStory, activeGroup, viewport} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();

    newStory.arrows = newStory.arrows.concat([{
				position: new_xy,
        hide: false,
        angle: '',
				text: ''
		}]);

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({
      stories: newStories
    })
  }


  drawLowerBounds(position) {
    const wh = [0, 0];
    const new_xy = [
      position.x, position.y
    ];
    const newOverlay = new_xy.concat(wh);

    const {stories, activeStory, activeGroup, viewport} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();

    newStory.overlays = newStory.overlays.concat([newOverlay])

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({
      stories: newStories
    })
  }

  drawUpperBounds(position) {
    const {stories, activeStory, activeGroup, viewport} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();
    const overlays = newStory.overlays;
		const overlay = overlays.pop();

    const xy = overlay.slice(0, 2);
    const wh = overlay.slice(2);

    // Set actual bounds
    const x = this.computeBounds(position.x, xy[0], wh[0]);
    const y = this.computeBounds(position.y, xy[1], wh[1]);

    const newOverlay = [x.start, y.start, x.range, y.range];

    newStory.overlays = overlays.concat([newOverlay]);

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({
      stories: newStories
    });
  }

  addArrowText(i) {
    this.setState({
      showModal: true,
			activeArrow: i
    })
  }

	deleteArrow(i) {
    const {stories, activeStory, activeArrow} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();

		newStory.arrows.splice(i, 1);

		if (i <= activeArrow) {
			this.setState({
				activeArrow: Math.max(0, activeArrow - 1)
			})
		}

    const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({
      stories: newStories
    });
	}

	deleteOverlay(i) {
    const {stories, activeStory} = this.state;
    let newStory = stories.get(activeStory) || this.defaultStory();

		newStory.overlays.splice(i, 1);

	  const newStories = new Map([...stories,
                              ...(new Map([[activeStory, newStory]]))]);

    this.setState({
      stories: newStories
    });
	}

  interactor(viewer) {
    viewer.addHandler('canvas-click', function(e) {
      const THIS = e.userData;
      const {drawing, drawType} = THIS.state;

      if (drawType == "arrow") {
        if (drawing == 1) {
          const position = normalize(viewer, e.position);
          THIS.drawArrow(position);
          e.preventDefaultAction = true;
          viewer.setMouseNavEnabled(true);
          THIS.setState({drawing: 0, drawType: ''})
        }
        return;
      }
    }, this);

    viewer.addHandler('canvas-drag', function(e) {
      const THIS = e.userData;
      const {drawing, drawType} = THIS.state;

      if (drawType != "box") {
        return;
      }

      const position = normalize(viewer, e.position);

      if (drawing == 1) {
        THIS.setState({drawing: 2})
        e.preventDefaultAction = true;
        THIS.drawLowerBounds(position);
      }
      else if (drawing == 2) {
        e.preventDefaultAction = true;
        THIS.drawUpperBounds(position);
      }
    }, this);

    viewer.addHandler('canvas-drag-end', function(e) {
      const THIS = e.userData;
      const {drawing, drawType} = THIS.state;

      if (drawType != "box") {
        return;
      }

      const position = normalize(viewer, e.position);

      if (drawing == 2) {
        e.preventDefaultAction = true;
        THIS.drawUpperBounds(position);
        THIS.setState({drawing: 0, drawType: ''})
      }
    }, this);


  }
  arrowClick() {
    const {drawType} = this.state;
    const _drawType = (drawType == 'arrow')? '' : 'arrow';
    this.setState({drawType: _drawType});
    const _drawing = (_drawType == '')? 0 : 1;
    this.setState({drawing: _drawing});
  }
  lassoClick() {
    const {drawType} = this.state;
    const _drawType = (drawType == 'lasso')? '' : 'lasso';
    this.setState({drawType: _drawType});
    const _drawing = (_drawType == '')? 0 : 1;
    this.setState({drawing: _drawing});
  }
  boxClick() {
    const {drawType} = this.state;
    const _drawType = (drawType == 'box')? '' : 'box';
    this.setState({drawType: _drawType});
    const _drawing = (_drawType == '')? 0 : 1;
    this.setState({drawing: _drawing});
  }
  handleChange(id, color, range, label, visible, changeComplete=true) {
    const { chanRender, chanLabel, groups, activeGroup } = this.state;
    const group = groups.get(activeGroup);
    let newRender = { ...chanRender.get(id) };
    if (group) {
      newRender = { ...group.chanRender.get(id) };
    }
    const newLabel = { ...chanLabel.get(id) };

    if (color) {
      newRender['color'] = color;
    }
    if (range) {
      newRender['range'] = range;
    }
    if (label !== null) {
      newLabel['label'] = label;
    }
    if (visible !== null) {
      newRender['visible'] = visible;
    }
    const newChanLabel = new Map([...chanLabel,
                                 ...(new Map([[id, newLabel]]))]);

    this.setState({
      chanLabel: newChanLabel
    });
    if (group) {
      const newGroup = {...group}
      const newChanRender = new Map([...group.chanRender,
                                 ...(new Map([[id, newRender]]))]);
      newGroup['chanRender'] = newChanRender
      const newGroups = new Map([...groups,
                                ...(new Map([[activeGroup, newGroup]]))]);
      this.setState({
        groups: newGroups,
      });
    }

    const newChanRender = new Map([...chanRender,
                               ...(new Map([[id, newRender]]))]);

    this.setState({
      chanRender: newChanRender,
      rangeSliderComplete: changeComplete
    });
  }

  createMaskOutput(masks) {
    return Array.from(masks.values()).map(v => {
      const channels = [{
          'color': rgbToHex(v.color),
          'label': v.name,
          'ids': v.map_ids
      }];
      let group_out = {
        'original_label': v.cache_name || '',
        'label': v.name,
        'path': v.path,
        'map_path': v.map_path,
        'channels': channels
      };
      return group_out;
    });
  }

  createGroupOutput(groups, chanLabel) {
    return Array.from(groups.values()).map(v => {
      const channels = v.activeIds.map(id => {
        const chan = v.chanRender.get(id);
        return {
          'color': rgbToHex(chan.color),
          'min': chan.range.min / chan.maxRange,
          'max': chan.range.max / chan.maxRange,
          'label': chanLabel.get(id).label,
          'id': id,
        } 
      });
      let render = channels;
      if (this.state.rgba) {
        render = Array.from(this.RGBAChannels().values()).map(rgba => {
          return {
            'color': rgbToHex(rgba.color),
            'min': rgba.range.min / rgba.maxRange,
            'max': rgba.range.max / rgba.maxRange,
            'label': rgba.label,
            'id': rgba.id,
          } 
        });
      }
      let group_out = {
        'label': v.label,
        'channels': channels,
        'render': render
      };
      if (v.id) {
        group_out.id = v.id;
      }
      if (v.uuid) {
        group_out.uuid = v.uuid;
      }
      return group_out;
    });
  }

  createStoryDefinition(waypoints, groups) {
    const story_definition = {
      //'channels': [],
      'waypoints': waypoints,
      'groups': groups,
      'sample_info': {
        'rotation': this.state.rotation,
        'name': this.state.sampleName,
        'text': this.state.sampleText
      },
      'image_name': this.state.imageName,
      'author_name': this.state.authorName
    };
    if (this.state.storyUuid) {
      story_definition.uuid = this.state.storyUuid;
    }
    if (this.state.img.uuid) {
      story_definition.imageUuid = this.state.img.uuid;
    }
    return story_definition;
  }

  createWaypoints(waypoints) {
    const {masks, groups} = this.state;
    return Array.from(waypoints.values()).map(v => {
      let wp = {
        'name': v.name,
        'text': v.text,
        'pan': v.pan,
        'zoom': v.zoom,
        'masks': v.masks,
        'arrows': v.arrows,
        'overlays': v.overlays,
        'group': groups.get(v.group).label,
      }
      Array.from(v.visLabels.values()).forEach(visLabel => {
        if (visLabel.value < 2) {
          if (visLabel.data != '') {
            wp[visLabel.label] = {
              data: visLabel.data,
              axes: {
                x: visLabel.x,
                y: visLabel.y
              },
              clusters: {
                labels: Array.from(visLabel.clusters.values()).map(c => {
                  return c.name;
                }).join(','),
                reorder: Array.from(visLabel.clusters.values()).map(c => {
                  return c.name;
                }).join(','),
                colors: Array.from(visLabel.clusters.values()).map(c => {
                  return rgbToHex(c.color);
                }).join(','),
              }
            }
          }
        }
        else if (visLabel.value == 2) {
          if (visLabel.data != '') {
            wp[visLabel.label] = {
              data: visLabel.data,
              colormapInvert: visLabel.colormapInvert
            }
          }
        }
        else {
          if (visLabel.data != '') {
            wp[visLabel.label] = visLabel.data
          }
        }
      })
      return wp;
    });
  }

  publish() {

    let minerva = this.props.env === 'cloud';
 
    if (minerva) {
      this.setPublishStoryModal(true)
    }
    else {
      let {groups, masks} = this.state;
      const {stories, chanLabel} = this.state;
      const {img} = this.state;

      const mask_output = this.createMaskOutput(masks);
      const group_output = this.createGroupOutput(groups, chanLabel);
      const story_output = this.createWaypoints(stories);
      const story_definition = this.createStoryDefinition(story_output, group_output);

      this.setState({publishing: true});

      let render = fetch('http://localhost:2020/api/render', {
        method: 'POST',
        body: JSON.stringify({
					'masks': mask_output,
          'groups': group_output,
          'waypoints': story_output,
          'header': this.state.sampleText,
          'rotation': this.state.rotation,
          'image': {
            'description': this.state.sampleName
          }
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })

      this.setProgressPolling(true);

      render.then(res => {
        this.setState({publishing: false});
        this.setProgressPolling(false);
        this.getPublishProgress();
      }).catch(err => {
        console.error(err);
        this.setState({publishing: false});
        this.setProgressPolling(false);
      })
    }
  }

  save() {

    let {groups, masks} = this.state;
    const {stories, chanLabel} = this.state;
    const {img} = this.state;
    let minerva = this.props.env === 'cloud';

    const mask_output = this.createMaskOutput(masks);
    const group_output = this.createGroupOutput(groups, chanLabel);
    const story_output = this.createWaypoints(stories);
    const story_definition = this.createStoryDefinition(story_output, group_output);

    this.setState({saving: true});

    if (minerva) {
      this.saveRenderingSettings(img.uuid, group_output).then(res => {
        Client.saveStory(story_definition).then(res => {
          this.setState({saving: false, storyUuid: res.uuid });
        }).catch(err => {
          console.error(err);
          this.setState({saving: false});
        });
      });
    }
    else {
			let save = fetch('http://localhost:2020/api/save', {
				method: 'POST',
				body: JSON.stringify({
					'waypoints': story_output,
					'groups': group_output,
					'masks': mask_output,
          'sample_info': {
            'rotation': this.state.rotation,
            'name': this.state.sampleName,
            'text': this.state.sampleText
          }
				}),
				headers: {
					"Content-Type": "application/json"
				}
      })

      save.then(res => {
        setTimeout(() => {
          this.setState({saving: false});
        }, 3000);
      }).catch(err => {
        console.error(err);
        this.setState({saving: false});
      })
    }
  }

  saveRenderingSettings(imageUuid, group_output) {
    return Client.createRenderingSettings(imageUuid, { groups: group_output }).then(json => {
      let groups = new Map(this.state.groups);
      json.groups.forEach((g,i) => {
        groups.get(i).id = g.id;
        groups.get(i).uuid = g.uuid;
      });
      this.setState({
        groups: groups
      })
    }).catch(err => {
      console.error(err);
      this.setState({saving: false});
    });
  }

  setProgressPolling(poll) {
    if (poll) {
      this.progressInterval = setInterval(() => {
        this.getPublishProgress();
      }, 500);
    } else {
      clearInterval(this.progressInterval);
    }
  }

  getPublishProgress() {
    fetch('http://127.0.0.1:2020/api/render/progress').then(response => {
      return response.json();
    }).then(progress => {
      if (progress.progress >= progress.max && progress.max != 0) {
        this.setState({
          published: true 
        })
      }
      this.setState({
        publishProgress: progress.progress,
        publishProgressMax: progress.max
      });
    });
  }

  getCreateLabel(label) {
    if (!this.validateChannelGroupLabel(label)) {
      return "Name contains invalid characters.";
    }
    return "Create Group: " + label;
  }

  openFileBrowser() {
    this.setState({ showFileBrowser: true});
  }

  onFileSelected(file, folder=null) {
    this.setState({ 
      showFileBrowser: false
    });
    if (file && file.path) {
      this.filePath.current.value = file.path;
    }
  }

  openVisDataBrowser() {
    this.setState({ showVisDataBrowser: true});
  }

  onVisDataSelected(file) {
    this.setState({ 
      showVisDataBrowser: false
    });
    if (file && file.path) {
      this.handleSelectVis(this.state.activeVisLabel, file.path)
    }
  }

  openMaskBrowser() {
    this.setState({ showMaskBrowser: true});
  }

  openMaskMapBrowser() {
    this.setState({ showMaskMapBrowser: true});
  }

  async fetchMaskPathStatus(mask_path) {
    // Double encoded URI component is required for flask
    const key = encodeURIComponent(encodeURIComponent(mask_path))

    const response =  await fetch(`http://localhost:2020/api/validate/u32/${key}`, {
      headers: {
        'pragma': 'no-cache',
        'cache-control': 'no-store'
      }
    })

    try {
      const res = handleFetchErrors(response)
      return res.json();
    }
    catch (error) {
      console.error(error)
      return {
        invalid: true,
        ready: false,
        path: '',
      }
    }
  }

  async updateMaskPathStatus() {
    const { masks, maskPathStatus, invalidMaskMap} = this.state;
    const unique_mask_paths = [...new Set([...masks].map(([key, value]) => value.path))]
    // Only fetch new status for paths that are not ready
    const non_ready_mask_paths = unique_mask_paths.filter(p => {
      const p_status = maskPathStatus.get(p)
      return !(p_status? p_status.ready : false)
    })

    const newMaskPathStatus = new Map(
      (await Promise.all(non_ready_mask_paths.map(this.fetchMaskPathStatus))).map((d,i) => {
        return [non_ready_mask_paths[i], d]
      })
    )
    const invalid_new_mask_paths = non_ready_mask_paths.filter(p => {
      const p_status = newMaskPathStatus.get(p)
      return p_status? p_status.invalid : true
    })
    let new_error = null
    if (invalid_new_mask_paths.length) {
      const s = invalid_new_mask_paths.length === 1 ? '' : 's'
      const list = [...masks].reduce((items, [i, mask]) => {
        if (invalid_new_mask_paths.includes(mask.path)) {
          return items == '' ? `#${i+1}` : items + `, #${i+1}`
        }
        return items
      }, '')
      new_error = `invalid mask image path${s}`
    }
    if (invalidMaskMap) {
      const csv_error = 'invalid mask cell state CSV';
      new_error = new_error ? `${new_error} and ${csv_error}`: csv_error;
    }
    
    this.setState({
      error: new_error,
      maskPathStatus: new Map([
        ...maskPathStatus,
        ...newMaskPathStatus
      ])
    })
  }

  setMaskPathStatusPolling(poll) {
    if (poll) {
      this.maskPathStatusInterval = setInterval(() => {
        this.updateMaskPathStatus();
      }, 3000);
    } else {
      clearInterval(this.maskPathStatusInterval);
    }
  }

  async onMaskMapSelected(file, params={}) {
    this.setState({ 
      showMaskMapBrowser: false
    });
    const {masks} = this.state;
    let mask = masks.get(0);

    if (mask === undefined) {
      mask = {
        cache_name: "",
        name: "all cells",
        color: [255, 255, 255],
        map_ids: [],
        map_path: "",
        path: ""
      };
    }

    if (file && file.path) {

      if (file.path != mask.map_path) {
        this.handleUpdateMask({
          ...mask,
          ...params,
          cache_name: "",
          name: "all cells",
          map_path: file.path
        }, true);
      }

      this.setState({
        invalidMaskMap: false,
        isMaskMapLoading: true
      });

      // Double encoded URI component is required for flask
      const key = encodeURIComponent(encodeURIComponent(file.path));

      try {
        const url = `http://localhost:2020/api/mask_subsets/${key}`;
        const response = await fetch(url, {
          headers: {
            'pragma': 'no-cache',
            'cache-control': 'no-store'
          }
        });
        const {storyMasksTempCache} = this.state;
        const res = handleFetchErrors(response);
        const data = (await res.json()) || {};
        const subsets = "mask_subsets" in data ? data.mask_subsets : [];
        const colors = "subset_colors" in data ? data.subset_colors : [];
        const subset_name_set = new Set();
        subsets.forEach(([key, ids], idx) => {
          const color = idx < colors.length? colors[idx]: [255, 255, 255];
          subset_name_set.add(key);
          this.handleMaskInsert({
            map_ids: ids,
            color: color,
            cache_name: key,
            name: key
          });
        });
        this.setState({
          isMaskMapLoading: false
        });
        [...storyMasksTempCache].forEach(([s_id, cache_name_list]) => {
          const story = this.state.stories.get(s_id);
          // Reset Story Masks from cache
          cache_name_list.forEach((cache_name) => {
            if (subset_name_set.has(cache_name)) {
              const is_same = ([idx, mask]) => mask.cache_name == cache_name;
              const m_id = ([...this.state.masks].find(is_same) || [])[0];
              if (m_id != undefined && !story.masks.includes(m_id)) {
                this.handleConcatStoryMasks([{id: m_id}], {s_id});
              }
            }
          });
        });
      }
      catch (error) {
        console.error(error)
        this.handleUpdateMask({
          ...mask,
          cache_name: "",
          name: "all cells",
          map_path: file.path,
        }, true);
        this.setState({
          invalidMaskMap: true,
          isMaskMapLoading: false
        });
      }
    }
  }

  onMaskSelected(file) {
    this.setState({ 
      showMaskBrowser: false
    });

    if (file && file.path) {
      if (this.state.masks.get(0) === undefined) {
        this.handleUpdateMask({
          cache_name: "",
          name: "all cells",
          color: [255, 255, 255],
          map_ids: [],
          map_path: "",
          path: file.path
        }, true);
      }
      else {
        this.handleUpdateAllMasks({
          path: file.path
        });
      }
    }
  }

  dismissWarning() {
    this.setState({warning: ''});
  }

  preview() {
    let {groups, chanLabel} = this.state;
      const group_output = this.createGroupOutput(groups, chanLabel);
      const story_output = this.createWaypoints(this.state.stories);
      const story_definition = this.createStoryDefinition(story_output, group_output);
      this.props.onPreview(true, story_definition);
  }

  setPublishStoryModal(active) {
    this.setState({showPublishStoryModal: active});
  }

  share() {
    let baseUrl = document.location.protocol +"//"+ document.location.host + document.location.pathname
    let url = baseUrl + `?story=${this.state.storyUuid}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
    this.setState({shareTooltip: 'Link copied to clipboard'});
    setTimeout(() => { this.setState({shareTooltip: null})}, 5000);
  }

  exit() {
    if (window.confirm("Close the story? Unsaved progress will be lost.")) {
      window.open("/", "_self");
    }
  }

  renderWarning() {
    if (!this.state.warning) {
      return null;
    }
    return (
      <div className="import-warning">
        <div className="ui icon message">
          <FontAwesomeIcon className="icon" icon={faExclamationCircle} />
          <div className="content">
            <div className="header">{this.state.warning}</div>
            <button className="ui button compact ml-1 mr-1" onClick={this.dismissWarning}>Dismiss</button>
          </div>
        </div>
      </div>
    );
  }

  renderErrors() {
    if (!this.state.error) {
      return null;
    }
    return (
      <div className="import-errors">
        <div className="ui icon message">
          <FontAwesomeIcon className="icon" icon={faExclamationCircle} />
          <div className="content">
            <div className="header">{this.state.error}</div>
          </div>
        </div>
      </div>
    );
  }

  RGBAChannels() {
    return new Map([
      [0, {
        id: 0,
        label: "Red",
        color: [255, 0, 0],
        range: {
          min: 0,
          max: 65535,
        },
        maxRange: 255
      }],
      [1, {
        id: 1,
        label: "Green",
        color: [0, 255, 0],
        range: {
          min: 0,
          max: 65535
        },
        maxRange: 255
      }],
      [2, {
        id: 2,
        label: "Blue",
        color: [0, 0, 255],
        range: {
          min: 0,
          max: 65535
        },
        maxRange: 255
      }],
    ]);
  }

  render() {
    const { rgba } = this.state;
    let minerva = this.props.env === 'cloud';
    const { activeVisLabel } = this.state;
    const { img, groups, chanLabel, textEdit } = this.state;
    const { chanRender, activeIds, activeGroup } = this.state;
    const group = groups.get(activeGroup);
    let activeChanRender = new Map(activeIds.map(a => [a, chanRender.get(a)]))
    if (group) {
      activeChanRender = new Map(activeIds.map(a => [a, group.chanRender.get(a)]))
    }
    const activeChanLabel = new Map(activeIds.map(a => [a, chanLabel.get(a)]))
    const activeChannels = new Map(activeIds.map(a => [a, {
      ...activeChanLabel.get(a), ...activeChanRender.get(a)
    } ])) 


    let visibleChannels = new Map(
      [...activeChannels].filter(([k, v]) => v.visible)
    );

    let minervaChannels = visibleChannels;
    if (rgba) {
      minervaChannels = this.RGBAChannels();
    }

    const {maskPathStatus} = this.state;
    const {stories, activeStory, masks, activeMaskId} = this.state;
    const story = stories.get(activeStory) || this.defaultStory(); 

    visibleChannels = new Map([ ...visibleChannels,
      ...(new Map(story.masks.map((k) => {
        let mask_k = `mask_${k}`;
        let mask = masks.get(k);
        mask.range = {
          max: 16777215,
          min: 0 
        };
        mask.u32 = true;
        // mask.map_ids = mask.map_ids;
        // Double encoded URI component is required for flask
        mask.key = encodeURIComponent(encodeURIComponent(mask.path));
        mask.maxRange = 16777215;
        mask.visible = true;
        mask.value = mask_k;
        mask.label = mask_k;
        mask.id = mask_k;
        return [mask_k, mask] 
      }).filter(([mask_k, mask]) => {
        // Only show masks that are ready
        const m_status = maskPathStatus.get(mask.path)
        return m_status? m_status.ready : false
      })))
    ]);

    const visLabels =  story.visLabels;
    const storyName = story.name;
    const storyText = story.text;
    const storyMasks = story.masks;
    const overlays = story.overlays;
    const arrows = story.arrows;
		const activeArrow = this.state.activeArrow;
		let arrowText = '';
		if (arrows.length > 0) {
			arrowText = arrows[activeArrow].text;
		}
		let arrowAngle = '';
		if (arrows.length > 0) {
			arrowAngle = arrows[activeArrow].angle;
		}
		let arrowHidden = false;
		if (arrows.length > 0) {
			arrowHidden = arrows[activeArrow].hide;
		}

    let viewer;
    if (minerva) {
      viewer = <MinervaImageView className="ImageView"
        img={ img }
        channels={ minervaChannels }
        overlays={ overlays } arrows={ arrows }
        handleViewport={ this.handleViewport }
        interactor={ this.interactor }
        rotation={this.state.rotation}
        rangeSliderComplete={this.state.rangeSliderComplete}
      />
    }
    else if (rgba) {
      viewer = <SimpleImageView className="ImageView"
        img={ img }
        channels={ visibleChannels }
        overlays={ overlays } arrows={ arrows }
        handleViewport={ this.handleViewport }
        interactor={ this.interactor }
        rotation={this.state.rotation}
      />
    }
    else {
      viewer = <ImageView className="ImageView"
        img={ img }
        channels={ visibleChannels }
        overlays={ overlays } arrows={ arrows }
        handleViewport={ this.handleViewport }
        interactor={ this.interactor }
        rotation={this.state.rotation}
      />
    }

    let saveButton = null;
    let publishButton = null;
    if (group != undefined) {
      saveButton = (
        <button className="ui button primary" 
          onClick={this.save} 
          disabled={this.state.saving} 
          title="Save story">
            <FontAwesomeIcon icon={faSave} />&nbsp;
          Save&nbsp;
          <ClipLoader animation="border"
          size={12} color={"#FFFFFF"}
          loading={this.state.saving}/>
        </button>
      );
      publishButton = (
        <button className="ui button primary" disabled={this.state.publishing} 
          onClick={this.publish}
          title="Publish story">
        <FontAwesomeIcon icon={faBullhorn} />&nbsp;
         Publish&nbsp;
         <ClipLoader animation="border"
            size={12} color={"#FFFFFF"}
            loading={this.state.publishing}/>
        </button>
      );
    }
    let previewButton = (
      <button className="ui button teal" onClick={() => this.preview()} title="Preview story">
        <FontAwesomeIcon icon={faEye} />&nbsp;
         Preview
      </button>
    );
    let shareButton = (
      <button className="ui button teal" onClick={() => this.share()} title="Share story"
        data-tooltip={this.state.shareTooltip} data-position="bottom center">
          <FontAwesomeIcon icon={faShare} />&nbsp;
      Share
      </button> 
    );
    if (this.props.env === 'local') {
      // Hide buttons which are not implemented in local environment yet
      // TODO - Implement rendering in backend and show previewButton 
      previewButton = null;
      shareButton = null;
      if (this.state.published) {
        previewButton = (
          <button className="ui button teal" onClick={() => window.open("/story")} title="Preview story">
            <FontAwesomeIcon icon={faEye} />&nbsp;
             Preview
          </button>
        );
      }
    }
    else if (!this.state.storyUuid) {
      shareButton = null;
      publishButton = null;
    }

    let editGroupsButton = this.state.textEdit ? "ui button" : "ui button active";
    let editStoryButton = this.state.textEdit ? "ui button active" : "ui button";

    let tabBar = '';
    if (!rgba) {
      tabBar = (
        <div className="row">
        <span className="ui buttons">
          <button className="ui button" onClick={() => this.toggleSampleInfo()}>
              Sample Info
          </button>
          <button className={editGroupsButton} onClick={() => this.toggleTextEdit(false)}>
            Edit Groups
          </button>
          <button className={editStoryButton} onClick={() => this.toggleTextEdit(true)}>
            Edit Story
          </button>
          {previewButton}
          {shareButton}
          {saveButton}
          {publishButton}
        </span>
        </div>
      )
    }
    else {
      tabBar = (
        <span className="ui buttons">
          <button className="ui button" onClick={() => this.toggleSampleInfo()}>
              Sample Info
          </button>
          {previewButton}
          {shareButton}
          {saveButton}
          {publishButton}
        </span>
      )
    }

    let groupBar = ''
    if (!rgba) {
      groupBar = (
      <div className="row">
        <div className="col pr-0">
            <div className="font-white mt-2">
              Channel Groups:
            </div>
            <CreatableSelect
            isClearable
            value={group}
            onChange={this.handleSelectGroup}
            options={Array.from(groups.values())}
            formatCreateLabel={this.getCreateLabel}
          />
        </div>
        <div className="col pl-0 pr-0 pt-3">
          <span className="ui buttons">
            {this.renderAddGroupModal()}
            {this.renderRenameModal()}
          </span>
        </div>
      </div>
      )
    }

    return (

      <div className="container-fluid Repo">
        {viewer}
				<Modal toggle={this.toggleModal}
					show={this.state.showModal}>
            <button className="ui button compact" onClick={this.handleArrowHide}>
            {arrowHidden? 'Show Arrow' : 'Hide Arrow'}
            </button>
            <form className="ui form" onSubmit={this.toggleModal}>
              <input type='text' placeholder='Arrow Angle' 
              value={arrowAngle} onChange={this.handleArrowAngle}
              />
              <input type='range' min="0" max="360" style={{ "width": "100%"}}
              value={arrowAngle} onChange={this.handleArrowAngle}
              />
						  <textarea placeholder='Arrow Description' value={arrowText}
						  onChange={this.handleArrowText} />
            </form>
				</Modal>

				<Modal toggle={this.toggleSampleInfo}
					show={this.state.sampleInfo}>
            <form className="ui form">
              <input type='text' placeholder='Sample Name'
              value={this.state.sampleName} onChange={this.handleSampleName}
              />
						  <textarea placeholder='Sample Description' value={this.state.sampleText}
						  onChange={this.handleSampleText} />
              <input type='text' placeholder='Author Name'
                value={this.state.authorName} onChange={this.handleAuthorName } />
              <div className="field">
                <label>Rotation (degrees)</label>
               <input type='text' placeholder='Rotation'
                value={this.state.rotation? this.state.rotation : ''}
               onChange={this.handleRotation}
               />
               <input type="range" className="image-rotation-range" min="-180" max="180" value={this.state.rotation} onChange={this.handleRotation} id="myRange"></input>
              </div>
              <div className="ui action input">
                <input ref={this.filePath} className='full-width-input' id="filepath" name="filepath" type="text" placeholder='Channel groups json file'/>
                <button type="button" onClick={this.openFileBrowser} className="ui button">Browse</button>
                <FileBrowserModal open={this.state.showFileBrowser} close={this.onFileSelected}
                  title="Select a json file" 
                  onFileSelected={this.onFileSelected} 
                  filter={["dat", "json"]}
                  />
              </div>
            </form>
				</Modal>

        <div className="row justify-content-between">
          <div className="col-md-6 col-lg-6 col-xl-4 bg-trans">

            {tabBar}
            {this.renderProgressBar()}
            <div className="pb-2">
              {groupBar}
            </div>
            <Controls 
              minerva={minerva}
              rgba={this.state.rgba}
              stories={this.state.stories}
							addArrowText={this.addArrowText}
							deleteArrow={this.deleteArrow}
							deleteOverlay={this.deleteOverlay}
              drawType = {this.state.drawType}
              arrowClick = {this.arrowClick}
              lassoClick = {this.lassoClick}
              boxClick = {this.boxClick}
              handleChange={this.handleChange}
              handleSelect={this.handleSelect}
              handleSelectStory={this.handleSelectStory}
              handleSelectStoryMasks={this.handleSelectStoryMasks}
              chanLabel={chanLabel}
              activeChanLabel={activeChanLabel}
              activeChannels={activeChannels}
              textEdit={textEdit}
              handleStoryName={this.handleStoryName}
              handleStoryText={this.handleStoryText}
              handleStoryChange={this.handleStoryChange}
              handleStoryInsert={this.handleStoryInsert}
              handleStoryRemove={this.handleStoryRemove}
							overlays={overlays}
							arrows={arrows}
              storyName={storyName}
              storyText={storyText}
              storyMasks={storyMasks}
              activeStory={activeStory}
              handleSelectVis={this.handleSelectVis}
              handleClusterChange={this.handleClusterChange}
              handleClusterInsert={this.handleClusterInsert}
              handleClusterRemove={this.handleClusterRemove}
              activeVisLabel={activeVisLabel}
              visLabels={visLabels}
              showVisDataBrowser={this.state.showVisDataBrowser}
              openVisDataBrowser={this.openVisDataBrowser}
              onVisDataSelected={this.onVisDataSelected}
              masks={masks}
              activeMaskId={activeMaskId}
              maskPathStatus={maskPathStatus}
              handleUpdateMask={this.handleUpdateMask}
              handleMaskChange={this.handleMaskChange}
              handleMaskInsert={this.handleMaskInsert}
              handleMaskRemove={this.handleMaskRemove}
              showMaskBrowser={this.state.showMaskBrowser}
              openMaskBrowser={this.openMaskBrowser}
              onMaskSelected={this.onMaskSelected}
              showMaskMapBrowser={this.state.showMaskMapBrowser}
              openMaskMapBrowser={this.openMaskMapBrowser}
              onMaskMapSelected={this.onMaskMapSelected}
              isMaskMapLoading={this.state.isMaskMapLoading}
              invalidMaskMap={this.state.invalidMaskMap}
            />
            <Confirm
              header="Delete channel group" 
              content="Are you sure?"
              confirmButton="Delete"
              size="small"
              open={this.state.deleteGroupModal}
              onCancel={() => { this.setState({deleteGroupModal: false})} }
              onConfirm={this.deleteActiveGroup}
            />
            <Confirm
              header="Delete waypoint"
              content="Are you sure?"
              confirmButton="Delete"
              size="small"
              open={this.state.deleteStoryModal}
              onCancel={() => { this.setState({deleteStoryModal: false})} }
              onConfirm={this.deleteStory}
            />
            <Confirm
              header="Delete cluster"
              content="Are you sure?"
              confirmButton="Delete"
              size="small"
              open={this.state.deleteClusterModal}
              onCancel={() => { this.setState({deleteClusterModal: false})} }
              onConfirm={this.deleteCluster}
            />
            <Confirm
              header="Delete mask"
              content="Are you sure?"
              confirmButton="Delete"
              size="small"
              open={this.state.deleteMaskModal}
              onCancel={() => { this.setState({deleteMaskModal: false})} }
              onConfirm={this.deleteMask}
            />
          </div>
          { this.renderWarning() }
          { this.renderErrors() }
          { this.renderExitButton() }
          <PublishStoryModal storyUuid={this.state.storyUuid} 
            onClose={() => this.setPublishStoryModal(false)}
            active={this.state.showPublishStoryModal} />
        </div>
      </div>
    );
  }

  renderAddGroupModal() {
    return (
      <div className="">
        <button className="ui button compact ml-1 mr-1" onClick={this.showAddGroupModal}>Add Group</button>
        <Modal show={this.state.addGroupModal} toggle={this.showAddGroupModal}>
        <form className="ui form" onSubmit={this.showAddGroupModal}>
          <label className="ui label">Add group</label>
           <Popup
            trigger={<input type="text" onChange={this.handleAddGroup} />}
            open={this.state.invalidChannelGroupName} 
            content='Channel group name must be unique and contain only letters, numbers, space, dash or underscore.'
            position='top center'
          />
        </form>
        </Modal>
      </div>
    );
  }

  renderRenameModal() {
    let group = this.state.groups.get(this.state.activeGroup);
    if (!group) {
      return null;
    }
    return (
      <div className="all-pointer">
        <button className="ui button compact" onClick={this.showRenameModal}>Rename</button>
        <Modal show={this.state.renameModal} toggle={this.showRenameModal}>
        <form className="ui form" onSubmit={this.showRenameModal}>
          <label className="ui label">Rename group</label>
          <Popup
            trigger={<input type="text" value={group.label} onChange={this.handleGroupRename} />}
            open={this.state.invalidChannelGroupName} 
            content='Channel group name can contain only letters, numbers, space, dash or underscore.'
            position='top center'
        />

        </form>
        </Modal>
      </div>
    );
  }

  renderProgressBar() {
    if (this.state.publishProgress <= 0) {
      return null;
    }
    let percent = Math.round(this.state.publishProgress/this.state.publishProgressMax*100);
    return (
      <div className="row">
        <div className="col">
          <Progress percent={percent} color='blue' progress autoSuccess active />
        </div>
      </div>
    );
  }

  renderExitButton() {
    return (
      <button type="button" className="ui button secondary exit-button" onClick={this.exit}>
        Close <FontAwesomeIcon icon={faWindowClose} />
      </button>
    )
  }

}

export default Repo;
