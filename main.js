'use strict';

let obsidian = require('obsidian');

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
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
	useInAllTabGroups: false,
	tabGroupIDs: []
};

class ContinuousModePlugin extends obsidian.Plugin {
    constructor(app, pluginManifest) { super(app, pluginManifest); }
    onload() {
   		return __async(this, null, function* () {
			yield this.loadSettings();
			// helpers
			const this_workspace = 					this.app.workspace;
			const getAllTabGroups = () =>			{ let groups = []; 
				this_workspace.rootSplit.children.forEach(child => { 
		    		if ( !child.allowSingleChild ) { groups.push(...child.children) } else { groups.push(child) }    		// get all tab groups in all root splits
		    	}); 
		    	return groups;
			}
			const getActiveTabGroup = () =>			{ return this_workspace.activeTabGroup; }
			const getTabGroupByID = (id) =>			{ return getAllTabGroups().find( group => group.id === id )}
			const getTabGroupHeaders = (group) =>	{ return this_workspace.activeTabGroup.tabHeaderEls; }
			const getTabHeaderIndex = (e) =>		{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
			const this_activeleaf = () =>			{ return this_workspace.activeLeaf; }
			const this_editor = () =>				{ return this_workspace.activeEditor?.editor; }
			/* ----------------------- */
			// Register events
			this.registerDomEvent(document,"dragstart",function(e)	{ if ( !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode')) { return; }
				if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }	// get initial tab header index for onTabHeaderDragEnd()
			});
			this.registerDomEvent(document, "click", function (e)	{ if ( !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode')) { return; }
				if ( e.target.classList.contains('workspace-tab-container') ) { e.target.closest('.workspace-tabs').querySelector('.workspace-tab-header.is-active')?.click(); }
			});
			this.registerDomEvent(document, "keydown", function (e)	{ 
				if ( !this_activeleaf().containerEl.closest('.workspace-tabs')?.classList.contains('is_continuous_mode')) { return; }
				leafArrowNavigation(e); 
			});	
			// add context menu items	
			this.registerEvent(
				this.app.workspace.on("file-menu", (menu, file) => {
					menu.addItem((item) => {
						item.setTitle("Continuous mode")
							.setIcon("book-down")
							.setSection("pane")
							.setChecked(getActiveTabGroup().containerEl.classList.contains('is_continuous_mode') ? true : false )
							.onClick(async () => { console.log(item), toggleContinuousMode() }
						);
					});
				})
			);
			this.registerEvent(
				this.app.workspace.on("editor-menu", (menu, editor, view) => {
					menu.addItem((item) => {
						item.setTitle("Continuous mode")
							.setIcon("book-down")
							.setSection("pane")
							.setChecked(getActiveTabGroup().containerEl.classList.contains('is_continuous_mode') ? true : false )
							.onClick(async () => { toggleContinuousMode() }
						);
					});
				})
			);
			// Open new splits in continuous mode
			this.registerEvent(
				this.app.workspace.on("layout-change", () => {
					if ( this.settings.useInAllTabGroups === true ) { let groups = getAllTabGroups(); 
						for (let i = 0; i < groups.length; i++) { toggleContinuousMode(groups[i].id,true); }		// bool === true => add continuous mode to all tab groups
					}
				})
			);
			/*-----------------------------------------------*/
			// Drag Tab Headers to Rearrange Leaves on dragstart
			const onTabHeaderDragEnd = (e,initialTabHeaderIndex) => {
				e.target.ondragend = function(f) { 
					if ( getTabHeaderIndex(f) !== initialTabHeaderIndex ) { rearrangeLeaves(f,initialTabHeaderIndex); }		// only rearrange leaves if tab header is actually moved to a new position
				}
			}
			// Rearrange leaves on dragend
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
			// Allow arrow navigation between open leaves
			const leafArrowNavigation = (e) => {
				if ( this_activeleaf().containerEl.closest('.workspace-split.mod-root') === null ) { return; } 									// return if not in leaf editor
				let cursorHead = this_editor()?.getCursor("head");
				let cursorAnchor = this_editor()?.getCursor("anchor");
				let activeTabGroupChildren = this_activeleaf().workspace.activeTabGroup.children;
				let thisContentDOM = this_editor()?.cm.contentDOM;
				switch(true) {
					case ( /Arrow/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ):		        		// Arrow navigation between leaves
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
		    // initialize continuous mode = add class to workspace tab groups from plugin settings
			const initContinuousMode = () => {
		    	if ( this.settings.tabGroupIDs ) {
					this.settings.tabGroupIDs.forEach(tabGroupID => {
						getTabGroupByID(tabGroupID)?.containerEl.classList.add('is_continuous_mode');		// don't use toggleContinuousMode here; we don't want to update the tabGroupIDs setting
					});
				}
			}
			// onlayoutReady
		    this.app.workspace.onLayoutReady(initContinuousMode);											// restore continuous mode in tab groups on app load and layout ready
		    
			// toggle continuous mode
			const toggleContinuousMode = (tabGroupID,bool) => {												// bool === true => add continuous mode to all tab groups
		    	let groups = getAllTabGroups();
				tabGroupID = tabGroupID || getActiveTabGroup().id;											// use the provided tabGroupID argument or get the active group ID
				const toggleThis = (id) => {
					let tabGroupContainer = getTabGroupByID(id)?.containerEl;						// get the tab group ID
					if ( bool === true ) { tabGroupContainer?.classList.add('is_continuous_mode'); } else { tabGroupContainer?.classList.toggle('is_continuous_mode');	}	// toggle style
					if ( this.settings.tabGroupIDs && this.settings.tabGroupIDs.includes(id) && bool !== true ) {
						this.settings.tabGroupIDs.splice(this.settings.tabGroupIDs.indexOf(id),1)	// remove the index from settings
					} else { 
						this.settings.tabGroupIDs.push(id);											// add the index to settings
					}
					this.settings.tabGroupIDs = [...new Set(this.settings.tabGroupIDs)];					// remove dupe IDs
					this.settings.tabGroupIDs.sort();														// sort the tabGroups setting
					this.saveSettings();																	// save the settings
				}
				switch(true) {
					case this_workspace.getLeftLeaf().parent === getActiveTabGroup():						// selecting toggle menu item in sidebar toggles all
						console.log(getAllTabGroups());
						break;
					default: toggleThis(tabGroupID);	break; 
				}
			}
			// ADD COMMAND PALETTE ITEMS
			// add command: toggle continuous mode in active tab group
			this.addCommand({																				
				id: "toggle-continuous-mode-active",
				name: "Toggle continuous mode in active tab group",
				callback: () => { toggleContinuousMode(); },
			});
			// add command: toggle display of leaf headers
			this.addCommand({																				
				id: "toggle-continuous-mode-view-headers",
				name: "Toggle visibility of leaf headers",
				callback: () => { getActiveTabGroup().containerEl.classList.toggle('hide_view_headers'); },
			});
			// add command palette items for 10 tab groups ==> is this really needed?
			// const addToggleCommands = () => {
				// for ( let count = 0; count < 10; count++ ) { 
					// this.addCommand({
						// id: "toggle-continuous-mode-"+ (Number(count) + 1),
						// name: "Toggle continuous mode in tab group "+ (Number(count) + 1),
						// callback: () => { toggleContinuousMode(getAllTabGroups()[count].id); },
					// });
				// }
			// }    
			// addToggleCommands();																				// call addCommands	
			
			// add settings to settings tab
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
    	Array.from(this.app.workspace.rootSplit.containerEl.querySelectorAll('.workspace-tabs.is_continuous_mode')).forEach(group => group.classList.remove('is_continuous_mode'));
    };

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
			//.setDesc('Always load leaves in tab groups in continuous mode')
			.addToggle((toggle) => toggle
			.setValue(this.plugin.settings.useInAllTabGroups)
			.onChange((value) => __async(this, null, function* () {
			this.plugin.settings.useInAllTabGroups = value;
			yield this.plugin.saveSettings();
		})));
	}
}

module.exports = ContinuousModePlugin;
