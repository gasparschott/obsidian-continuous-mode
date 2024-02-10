'use strict';

let obsidian = require('obsidian');

let DEFAULT_SETTINGS = {
	'tabGroupIds': []
};

class ContinuousModePlugin extends obsidian.Plugin {
    async onload() {
		console.log('Loading the Continuous Mode plugin.');
		await this.loadSettings();
		/* ----------------------- */
		// HELPERS
		const getAllTabGroups = (begin_node,all_tabs) => {
			let all_children = begin_node?.children;
			if ( all_children === undefined ) { return }
			all_tabs = all_tabs || [];
			if ( begin_node.children ) {
				begin_node.children.forEach(function(child) {
					if (child.type === 'tabs') { all_tabs.push(child); }
					all_children = all_children.concat(getAllTabGroups(child,all_tabs));
				});
			}
			return all_tabs;
		}
		const this_workspace =					this.app.workspace;
		const getActiveTabGroup = () =>			{ return this_workspace.activeTabGroup; }
		const getTabGroupById = (id) =>			{ return getAllTabGroups(this_workspace.rootSplit)?.find( tab_group => tab_group.containerEl.dataset.tab_group_id === id ); }
		const getTabGroupHeaders = () =>		{ return this_workspace.activeTabGroup.tabHeaderEls; }
		const getTabHeaderIndex = (e) =>		{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
		const getActiveLeaf = () =>				{ return this_workspace.activeLeaf; }
		const getActiveEditor = () =>			{ return this_workspace.activeEditor?.editor; }
		const findStackedMenuEntry = (menu) =>    { return menu.items.filter(entry => {return entry.dom.outerText == "Stack tabs" | entry.dom.outerText == "Unstack tabs" })[0] }
		const isContinuousMode = (id) =>        { return getTabGroupById(id).containerEl?.classList.contains('is_continuous_mode') }
		const disableContinuousMode = (id) =>   { getTabGroupById(id).containerEl?.classList.remove('is_continuous_mode') }
		const enableContinuousMode = (id) =>    { getTabGroupById(id).containerEl?.classList.add('is_continuous_mode') }
		const STACKED_TABS_WARNING = "Continous Mode: Stacked tabs have been modified by this plugin. If you have any trouble with stacking tabs, please try disabling this plugin before reporting errors to the Obsidian team."
		const updateTabGroupIds = () => {																								// add data tab_group_id to each .workspace-tabs
			getAllTabGroups(this.app.workspace.rootSplit)?.forEach( 
				tab_group => { if ( tab_group ) { tab_group.containerEl.dataset.tab_group_id = this.app.appId +'_'+ tab_group.id } }
			);
		}
		const updateDataTabGroupIds = () => {																							// remove tab_group_ids from data.json
			let all_tab_groups = getAllTabGroups(this.app.workspace.rootSplit) || [];
			let all_tab_group_ids = [];
			let data_tab_group_ids = this.settings.tabGroupIds;
			all_tab_groups.forEach( tab_group => all_tab_group_ids.push(this.app.appId +'_'+ tab_group.id) );	//  get all tab group ids
			data_tab_group_ids.forEach( id => { 
				if ( this.app.appId === id.split('_')[0] ) {
					if ( !all_tab_group_ids.includes(id) ) {
						this.settings.tabGroupIds.splice(this.settings.tabGroupIds.indexOf(id),1); 
						this.saveSettings();
					}
				} 
			})
		}

		console.warn(STACKED_TABS_WARNING)
		
		this.original_stacked_tabs_cmd = this.app.commands.commands['workspace:toggle-stacked-tabs'].checkCallback                    // preserve default obsidian behavior... very important! We'll need it to restore the state on unload
		let stacked_tabs_cmd = this.original_stacked_tabs_cmd                                                                         // get a reference in context so that it can be grafted into the new callback
		this.app.commands.commands['workspace:toggle-stacked-tabs'].checkCallback = function(e){                                      // ...now hijack stacked tabs command to disable continous mode. This is sketchy stuff.
			if(!e){
				try{                                                                                                                  // wrap the plugin functionality in a try/catch block for an extra layer of safety
					let id = getActiveTabGroup().containerEl.dataset.tab_group_id;
					if ( isContinuousMode(id) ) { toggleContinuousMode(id) }
				} catch { }                                                                                                           // just carry on if the plugin behavior fails
			} else {
				console.warn(STACKED_TABS_WARNING)
			}
			return e || stacked_tabs_cmd(e)
		}

		updateTabGroupIds(); 
		/* ----------------------- */
		// TOGGLE CONTINUOUS MODE
		const toggleContinuousMode = (tab_group_id) => {
			tab_group_id = tab_group_id ?? getActiveTabGroup().containerEl.dataset.tab_group_id;		// use provided tabGroupId from stored settings or use activeTabGroupId from toggle command

			if ( this.app.appId === tab_group_id.split('_')[0] ) {
				switch(true) {
					case isContinuousMode(tab_group_id):									// if tab group is in continuous mode
						disableContinuousMode(tab_group_id);							// remove style
						this.settings.tabGroupIds.splice(this.settings.tabGroupIds.indexOf(tab_group_id),1);						// remove tabGroupdId from data.json
						break;
					default:																										// if tab group is not in continuous mode (e.g., on app launch)
						let thisTabGroup = getTabGroupById(tab_group_id)
						enableContinuousMode(tab_group_id);											// add style
						if (thisTabGroup.isStacked) {thisTabGroup.setStacked(false)}						// disable stacked tabs
						if ( !this.settings.tabGroupIds.includes(tab_group_id) ) { this.settings.tabGroupIds.push(tab_group_id); }	// add tabGroupdId to data.json if it is not already there
				}
			}
			this.settings.tabGroupIds = [...new Set(this.settings.tabGroupIds)];					// remove dupe IDs if necessary
			this.settings.tabGroupIds.sort();																					// sort the tabGroupIds
			this.saveSettings();																								// save the settings
		}
		// INITIALIZE CONTINUOUS MODE = add class to workspace tab groups from plugin settings
		const initContinuousMode = () => {
			if ( this.settings.tabGroupIds ) {																				// if there are any saved tabGroupIds...
				this.settings.tabGroupIds.forEach( tab_group_id => {													// for each id...
					if ( this.app.appId === tab_group_id.split('_')[0] ) {											// if the tabgroup belongs to the current app (window)...
						toggleContinuousMode(tab_group_id);															// toggle continuous mode
					}
				});
			}
		}
		initContinuousMode();
		/*-----------------------------------------------*/
		// DRAG TAB HEADERS to Rearrange Leaves on dragstart
		const onTabHeaderDragEnd = (e,initialTabHeaderIndex) => {
			e.target.ondragend = function(f) { 
				if ( getTabHeaderIndex(f) !== initialTabHeaderIndex ) { rearrangeLeaves(f,initialTabHeaderIndex); }		// only rearrange leaves if tab header is actually moved to a new position
			}
		}
		const scrollActiveLeafIntoView = () => {
			let el = getActiveLeaf()?.containerEl;
			el = ( getActiveTabGroup().containerEl.classList.contains('hide_note_titles') ? el?.querySelector('.cm-editor') : el.querySelector('.view-header') );
			el.scrollIntoView();
		}
		// REARRANGE LEAVES on dragend
		const rearrangeLeaves = (e,initialTabHeaderIndex) => {
			let this_tab_container = e.target.closest('.workspace-tabs').querySelector('.workspace-tab-container');		// get current tab container
			let leaves = Array.from(this_tab_container.children);														// get current tab container leaves
			let finalTabHeaderIndex = getTabHeaderIndex(e);																// get final dropped tab header index
			let moved = leaves.splice(initialTabHeaderIndex,1);															// get the moved leave
			let rearranged = leaves.toSpliced(finalTabHeaderIndex,0,moved[0]);											// move the moved leaf into position
			this_tab_container.setChildrenInPlace(rearranged);															// replace tab container content with rearranged leaves
			getTabGroupHeaders()[finalTabHeaderIndex].click();															// confirm drag and focus leaf by clicking tab
		}
		// ARROW NAVIGATION between open leaves
		const leafArrowNavigation = (e) => {
			if ( getActiveLeaf().containerEl.closest('.workspace-split.mod-root') === null || !getActiveEditor()?.hasFocus() ) { return; }	// return if not in leaf editor or editor not focussed
			let cursorAnchor = getActiveEditor()?.getCursor('anchor');
			let activeTabGroupChildren = getActiveLeaf().workspace.activeTabGroup.children;
			switch(true) {
				case ( /Arrow/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ):					// Arrow navigation between leaves
					switch(e.key) {
						case 'ArrowUp': case 'ArrowLeft':
							switch(true) {
								case e.target.classList.contains('inline-title') && window.getSelection().anchorOffset === 0:									// cursor in inline-title
								case e.target.classList.contains('metadata-properties-heading'):																// cursor in properties header
								case cursorAnchor?.line === 0 && cursorAnchor?.ch === 0:																		// cursor at first line, first char
								case getActiveLeaf().getViewState().state.mode === 'preview':																	// leaf is in preview mode
								case (!/markdown/.test(getActiveLeaf().getViewState().type)):																	// leaf is empty (new tab)
									if ( getActiveLeaf().containerEl.previousSibling !== null ) {																// ignore if first leaf
										this_workspace.setActiveLeaf(activeTabGroupChildren[activeTabGroupChildren.indexOf(getActiveLeaf()) - 1],{focus:true});	// make previous leaf active 
										getActiveEditor()?.setCursor({line:getActiveEditor().lastLine(),ch:getActiveEditor().lastLine().length - 1});			// select last char
									}
									break;
							}
							break;
						case 'ArrowDown':	case 'ArrowRight': 
							switch(true) {
								case ( cursorAnchor?.ch === getActiveEditor()?.getLine(getActiveEditor().lastLine()).length && cursorAnchor?.line === getActiveEditor()?.lineCount() - 1 ):
								case getActiveLeaf().getViewState().state.mode === 'preview':																	// leaf is in preview mode
								case (!/markdown/.test(getActiveLeaf().getViewState().type)):																	// make next leaf active 
									this_workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(getActiveLeaf()) + 1] || getActiveLeaf()),{focus:true}); 
									break;
							}
							break;
					}
					break;
				// Start another keydown case here
			}
		}
		// REGISTER EVENTS
		this.registerDomEvent(document,'click', function (e) {
			switch(true) {
				case !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode'): 
					return; 
				case ( /workspace-tab-header/.test(e.target.className) ):
					scrollActiveLeafIntoView();
					break;
			}
		});
		this.registerDomEvent(document,'keydown', function (e) {
			if ( !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode')) { return; }
			if ( !getActiveLeaf().containerEl.closest('.workspace-tabs')?.classList.contains('is_continuous_mode') ) { return; }
			leafArrowNavigation(e); 
		});	
		this.registerDomEvent(document,'dragstart',function(e) { 
			if ( !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode')) { return; }
			if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }	// get initial tab header index for onTabHeaderDragEnd()
		});
		const addContinuousModeMenuItem = (item, tab_group_id) => {
			item.setTitle(isContinuousMode(tab_group_id) ? 'Disable Continuous' : 'Enable Continuous')
				.setIcon('book-down')
				.setSection('action')
				.onClick(async () => { 
					toggleContinuousMode(tab_group_id) }
			);
		}
		const hijackStackedTabsMenuItem = (menu, tab_group_id) => {
			let stack_menu_entry = findStackedMenuEntry(menu)
				let original_stack_menu_callback = stack_menu_entry.callback
				stack_menu_entry.callback = () => {                         // hijack stacked menu toggle to disable contionous when stacked is enabled
					console.warn(STACKED_TABS_WARNING)
					try {                                                   // wrap the plugin functionality in a try/catch block for an extra layer of safety
						if ( isContinuousMode(tab_group_id) ) {
							toggleContinuousMode(tab_group_id)
						}
					} catch { }
					original_stack_menu_callback()
				}
		}
		this.registerEvent(
			this.app.workspace.on('tab-group-menu', (menu,tab_group) => {
				let tab_group_id = tab_group.containerEl.dataset.tab_group_id
				
				hijackStackedTabsMenuItem(menu, tab_group_id)
				menu.addItem((item) => { addContinuousModeMenuItem(item, tab_group_id) });
			})
		)
		this.registerEvent(													// initContinuousMode on layout change
			this.app.workspace.on('layout-change', async () => { 
				updateTabGroupIds(); 
				updateDataTabGroupIds(); 
			})
		);
		this.app.workspace.onLayoutReady( async () => {						// initContinuousMode on layout ready
			updateTabGroupIds(); 
			updateDataTabGroupIds();
			initContinuousMode();
		})
		// ADD COMMAND PALETTE ITEMS
		this.addCommand({																				// add command: toggle continuous mode in active tab group
			id: 'toggle-continuous-mode-active',
			name: 'Toggle continuous mode in active tab group',
			callback: () => { toggleContinuousMode(); },
		});
		this.addCommand({																				// add command: toggle display of leaf headers
			id: 'toggle-continuous-mode-view-headers',
			name: 'Toggle visibility of note titles in active tab group',
			callback: () => { getActiveTabGroup().containerEl.classList.toggle('hide_note_titles'); },
		});
    } 
    // end onload
    // on plugin unload
	onunload() {
		console.log('Unloading the Continuous Mode plugin.');
		Array.from(this.app.workspace.rootSplit.containerEl.querySelectorAll('.workspace-tabs')).forEach(
			tab_group => { tab_group.classList.remove('is_continuous_mode','hide_note_titles'); delete tab_group.dataset.tab_group_id; }
		);
		this.app.commands.commands['workspace:toggle-stacked-tabs'].checkCallback = this.original_stacked_tabs_cmd
    }
	// load settings
    async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    // save settings
    async saveSettings() {
        await this.saveData(this.settings);
    }
}
module.exports = ContinuousModePlugin;
