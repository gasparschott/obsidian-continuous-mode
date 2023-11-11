'use strict';

let obsidian = require('obsidian');

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED 'AS IS' AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE. 
***************************************************************************** */

var __async = (__this, __arguments, generator) => {
	return new Promise((resolve, reject) => {
		var fulfilled = (value) => {
			try {
				step(generator.next(value));
			} catch (e) {
				reject(e);
			}
		};
		var rejected = (value) => {
			try {
				step(generator.throw(value));
			} catch (e) {
				reject(e);
			}
		};
		var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
		step((generator = generator.apply(__this, __arguments)).next());
	});
};
const DEFAULT_SETTINGS = {
	'openNewSplitsInContinuousMode': false,
	'hideNoteHeaders': false,
	'tabGroupIds': []
};
const getAllTabGroups = (workspace_rootsplit) => { let groups = []; 
	workspace_rootsplit.children.forEach(child => { 
		if ( !child.allowSingleChild ) { groups.push(...child.children) } else { groups.push(child) }	// get all tab groups in all root splits
	}); 
	return groups;
}

class ContinuousModePlugin extends obsidian.Plugin {
    constructor(app, pluginManifest) { super(app, pluginManifest); }
    onload() {
		return __async(this, null, function* () {
			yield this.loadSettings();
			// helpers
			let tabGroupIds;
			const this_workspace =					this.app.workspace;
			const getActiveTabGroup = () =>			{ return this_workspace.activeTabGroup; }
			const getTabGroupById = (id) =>			{ return getAllTabGroups(this_workspace.rootSplit).find( group => group.id === id ); }
			const getTabGroupHeaders = (group) =>	{ return this_workspace.activeTabGroup.tabHeaderEls; }
			const getTabHeaderIndex = (e) =>		{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
			const this_activeleaf = () =>			{ return this_workspace.activeLeaf; }
			const this_editor = () =>				{ return this_workspace.activeEditor?.editor; }
			/* ----------------------- */
			// Register DOM events
			this.registerDomEvent(document,'click', function (e) {
				switch(true) {
					case !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode'): return;			// ignore if target is not in continuous mode -- is this needed?
					case ( /workspace-tab-header/.test(e.target.className) ): 
					console.log(this_activeleaf());
						//e.target.closest('.workspace-tabs').querySelector('.workspace-tab-header.is-active')?.click();
						if ( getActiveTabGroup().containerEl.classList.contains('hide_note_titles') ) {
							this_activeleaf()?.containerEl?.querySelector('.cm-editor').scrollIntoView({ behavior: "smooth", inline: "nearest" }); 
						} else {
							this_activeleaf()?.containerEl?.querySelector('.view-header').scrollIntoView({ behavior: "smooth", inline: "nearest" }); 
						}
						break;
				}
			});
			this.registerDomEvent(document,'keydown', function (e)	{ 
				if ( !this_activeleaf().containerEl.closest('.workspace-tabs')?.classList.contains('is_continuous_mode') ) { return; }
				leafArrowNavigation(e); 
			});	
			this.registerDomEvent(document,'dragstart',function(e)	{ if ( !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode')) { return; }
				if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }	// get initial tab header index for onTabHeaderDragEnd()
			});
			// Register events: add context menu items	
			const addContinuousModeMenuItem = (item) => {
				item.setTitle('Continuous mode')
					.setIcon('book-down')
					.setSection('pane')
					.setChecked( getActiveTabGroup().containerEl.classList.contains('is_continuous_mode') ? true : false )
					.onClick(async () => { toggleContinuousMode() }
				);
			}
			this.registerEvent(
				this.app.workspace.on('file-menu', (menu) => {
					menu.addItem((item) => { addContinuousModeMenuItem(item) });
				})
			);
			this.registerEvent(
				this.app.workspace.on('editor-menu', (menu) => {
					menu.addItem((item) => { addContinuousModeMenuItem(item) });
				})
			);
			this.registerEvent(
				this.app.workspace.on('layout-ready', async () => {
					initContinuousMode();
				})
			);
			this.registerEvent(
				this.app.workspace.on('layout-change', async () => {
					if ( this.settings.openNewSplitsInContinuousMode === true && !this.app.workspace.getMostRecentLeaf().parent.containerEl.classList.contains('is_continuous_mode') ) { 
//						this.app.workspace.getMostRecentLeaf().parent.containerEl.classList.add('is_continuous_mode')
					} else {
//						this.app.workspace.getMostRecentLeaf().parent.containerEl.classList.remove('is_continuous_mode');
					}
				})
			);
			/*-----------------------------------------------*/
			// DRAG TAB HEADERS to Rearrange Leaves on dragstart
			const onTabHeaderDragEnd = (e,initialTabHeaderIndex) => {
				e.target.ondragend = function(f) { 
					if ( getTabHeaderIndex(f) !== initialTabHeaderIndex ) { rearrangeLeaves(f,initialTabHeaderIndex); }		// only rearrange leaves if tab header is actually moved to a new position
				}
			}
			// REARRANGE LEAVES on dragend
			const rearrangeLeaves = (e,initialTabHeaderIndex) => {
				let this_tab_container = e.target.closest('.workspace-tabs').querySelector('.workspace-tab-container');		// get current tab container
				let leaves = Array.from(this_tab_container.querySelectorAll('.workspace-leaf'));							// get current tab container leaves
				let finalTabHeaderIndex = getTabHeaderIndex(e);																// get final dropped tab header index
				let rearranged = '';																						// define rearranged leaves variable
				let moved = leaves.splice(initialTabHeaderIndex,1);															// get the moved leave
				leaves.toSpliced(finalTabHeaderIndex,0,moved[0]);															// move the moved leaf into position
				leaves.forEach( leaf => rearranged += leaf.outerHTML );														// compose rearranged HTML
				this_tab_container.innerHTML = rearranged;																	// replace tab container content with rearranged leaves
				getTabGroupHeaders()[finalTabHeaderIndex].click();															// confirm drag and focus leaf by clicking tab
			}
			// ARROW NAVIGATION between open leaves
			const leafArrowNavigation = (e) => {
				if ( this_activeleaf().containerEl.closest('.workspace-split.mod-root') === null ) { return; }								// return if not in leaf editor
				// let cursorHead = this_editor()?.getCursor('head');
				let cursorAnchor = this_editor()?.getCursor('anchor');
				let activeTabGroupChildren = this_activeleaf().workspace.activeTabGroup.children;
				let thisContentDOM = this_editor()?.cm.contentDOM;
				switch(true) {
					case ( /Arrow/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ):					// Arrow navigation between leaves
						switch(e.key) {
							case 'ArrowUp': case 'ArrowLeft':
								switch(true) {
									case e.target.classList.contains('inline-title') && window.getSelection().anchorOffset === 0:									// cursor in inline-title
									case e.target.classList.contains('metadata-properties-heading'):																// cursor in properties header
									case cursorAnchor?.line === 0 && cursorAnchor?.ch === 0:																		// cursor at first line, first char
									case this_activeleaf().getViewState().state.mode === 'preview':																	// leaf is in preview mode
									case (!/markdown/.test(this_activeleaf().getViewState().type)):													// leaf is empty (new tab)
										if ( this_activeleaf().containerEl.previousSibling !== null ) {																// ignore if first leaf
											this_workspace.setActiveLeaf(activeTabGroupChildren[activeTabGroupChildren.indexOf(this_activeleaf()) - 1],{focus:true});	// make previous leaf active 
											this_editor()?.setCursor({line:this_editor().lastLine(),ch:this_editor().lastLine().length - 1});						// select last char
										}
										break;
								}
								break;
							case 'ArrowDown':	case 'ArrowRight': 
								switch(true) {
									case ( cursorAnchor?.ch === this_editor()?.getLine(this_editor().lastLine()).length && cursorAnchor?.line === this_editor()?.lineCount() - 1 ):
									case this_activeleaf().getViewState().state.mode === 'preview':															// leaf is in preview mode
									case (!/markdown/.test(this_activeleaf().getViewState().type)):															// make next leaf active 
										this_workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(this_activeleaf()) + 1] || this_activeleaf()),{focus:true}); 
										break;
								}
								break;
						}
						break;
					// Start another keydown case here
				}
			}
			// INITIALIZE CONTINUOUS MODE = add class to workspace tab groups from plugin settings
			const initContinuousMode = () => {
				let all_tab_groups = getAllTabGroups(this.app.workspace.rootSplit), all_tab_group_ids = [];
					all_tab_groups.forEach(group => all_tab_group_ids.push(group.id) );									//  get all tab group ids
				if ( this.settings.tabGroupIds ) {
					this.settings.tabGroupIds.forEach(settingsTabGroupId => {											// for each tab group id in settings...
						if ( this.app.appId === settingsTabGroupId.split('_')[0] ) {
							switch(true) {
								case all_tab_group_ids.includes(settingsTabGroupId.split('_')[1]):
								console.log("B")
									toggleContinuousMode(settingsTabGroupId);													// else restore continuous mode
									break;
								case !all_tab_group_ids.includes(settingsTabGroupId.split('_')[1]):
									console.log("A")
									this.settings.tabGroupIds.splice(this.settings.tabGroupIds.indexOf(settingsTabGroupId),1);	// remove closed tab group ids from settings
									this.saveSettings();
									break;
							}
						}
					});
				}
			}
			// TOGGLE CONTINUOUS MODE
			const toggleContinuousMode = (tabGroupId) => { 
				tabGroupId = tabGroupId ?? getActiveTabGroup().id;										// use provided tabGroupId from stored settings or use activeTabGroupId from toggle command
				let settings_id = this.app.appId +'_'+ tabGroupId;										// prep id for settings
				switch(true) {
					case ( /_/.test(tabGroupId) ):														// from initContinuousMode: restore continuous mode; other ids will not include _
						getTabGroupById(tabGroupId.split('_')[1])?.containerEl.classList.add('is_continuous_mode');
						if ( this.settings.hideNoteHeaders === true ) { getTabGroupById(tabGroupId.split('_')[1])?.containerEl.classList.add('hide_note_titles'); }	// restore hidden note headers
						break;
					case getTabGroupById(tabGroupId)?.containerEl?.classList.contains('is_continuous_mode'):
						getTabGroupById(tabGroupId)?.containerEl?.classList.remove('is_continuous_mode');		// toggle style
						this.settings.tabGroupIds.splice(this.settings.tabGroupIds.indexOf(settings_id),1);		// ...remove the tabGroupdId from settings
						break;
					default:
						getTabGroupById(tabGroupId)?.containerEl?.classList.add('is_continuous_mode');								// toggle style
						this.settings.tabGroupIds.push(settings_id);													// else add the tabGroupdId to settings
				}
				this.settings.tabGroupIds = [...new Set(this.settings.tabGroupIds)];					// remove dupe IDs if necessary
				this.settings.tabGroupIds.sort();														// sort the tabGroups setting
				this.saveSettings();																	// save the settings
			}
			// ADD COMMAND PALETTE ITEMS
			this.addCommand({																				// add command: toggle continuous mode in active tab group
				id: 'toggle-continuous-mode-active',
				name: 'Toggle continuous mode in active split',
				callback: () => { toggleContinuousMode(); },
			});
			this.addCommand({																				// add command: toggle display of leaf headers
				id: 'toggle-continuous-mode-view-headers',
				name: 'Toggle visibility of note titles in active split',
				callback: () => { getActiveTabGroup().containerEl.classList.toggle('hide_note_titles'); },
			});
			// ADD SETTINGS TO SETTINGS TAB
			this.addSettingTab(new SettingsTab(this.app, this));										
		});

    } // end onload
	// load settings
    loadSettings() {
		return __async(this, null, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    // save settings
    saveSettings() {
		return __async(this, null, function* () {
            yield this.saveData(this.settings);
        });
    }
    // on plugin unload
	onunload() { 
		console.log('Unloading the Continuous Mode plugin.');
		Array.from(this.app.workspace.rootSplit.containerEl.querySelectorAll('.workspace-tabs.is_continuous_mode')).forEach(group => group.classList.remove('is_continuous_mode','hide_note_titles'));
    }
}

// SETTINGS TAB
class SettingsTab extends obsidian.PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.app = app;
		this.plugin = plugin;
	}
	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Settings' });
		new obsidian.Setting(containerEl)
			.setName('Open all new splits in continuous mode')
			.addToggle((toggle) => toggle
			.setValue(this.plugin.settings.openNewSplitsInContinuousMode)
			.onChange((value) => __async(this, null, function* () {
				this.plugin.settings.openNewSplitsInContinuousMode = value;
				yield this.plugin.saveSettings();
		})));
		new obsidian.Setting(containerEl)
			.setName('Hide note titles')
			.addToggle((toggle) => toggle
			.setValue(this.plugin.settings.hideNoteHeaders)
			.onChange((value) => __async(this, null, function* () {
				this.plugin.settings.hideNoteHeaders = value;
				yield this.plugin.saveSettings();
				let groups = getAllTabGroups(this.app.workspace.rootSplit); 
				groups.forEach(group => {
					switch(true) {
						case !group.containerEl.classList.contains('is_continuous_mode'):					break;	// do nothing if group is not in continuous mode
						case value === false:	group.containerEl.classList.remove('hide_note_titles');		break;
						case value === true:	group.containerEl.classList.add('hide_note_titles');		break;
					}
				})
		})));
	}
}

module.exports = ContinuousModePlugin;
