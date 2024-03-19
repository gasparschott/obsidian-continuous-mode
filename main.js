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
		const updateTabGroupDatasetIds = () => {																								// add tab_group_id dataset to each .workspace-tabs
			getAllTabGroups(this.app.workspace.rootSplit)?.forEach( 
				tab_group => { if ( tab_group ) { tab_group.containerEl.dataset.tab_group_id = this.app.appId +'_'+ tab_group.id } }
			);
		}
		const cleanDataTabGroupIds = () => { return;																							// clean up tab_group_ids in data.json
			// !! this is dangerous, as it can incorrectly remove ids when the workspace is changed; function is disabled for now.
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
		updateTabGroupDatasetIds(); 
		/* ----------------------- */
		// TOGGLE CONTINUOUS MODE
		const toggleContinuousMode = (tab_group_id,bool) => {
			const active_floating_tab_group = () => { return this.app.workspace.floatingSplit?.children[0]?.children?.filter( child => child.containerEl.classList.contains('mod-active'))[0]; }
			const isFloatingWindow = () => { return this.app.workspace.floatingSplit?.children?.length > 0 && active_floating_tab_group() !== undefined; }
			switch(true) {
				case isFloatingWindow():	active_floating_tab_group().containerEl.classList.toggle('is_continuous_mode');		break;	// if floating window, don't save tabGroupIds
				case this.app.appId === tab_group_id?.split('_')[0]:
					switch(true) {
						case getTabGroupById(tab_group_id)?.containerEl?.classList.contains('is_continuous_mode') && bool !== true:		// if tab group is in continuous mode
							getTabGroupById(tab_group_id)?.containerEl?.classList.remove('is_continuous_mode');							// remove style
							this.settings.tabGroupIds.splice(this.settings.tabGroupIds.indexOf(tab_group_id),1);						// remove tabGroupdId from data.json
							break;
						default:																										// if tab group is not in continuous mode (e.g., on app launch)
							getTabGroupById(tab_group_id)?.containerEl?.classList.add('is_continuous_mode');							// add style
							if ( !this.settings.tabGroupIds.includes(tab_group_id) ) { this.settings.tabGroupIds.push(tab_group_id); }	// add tabGroupdId to data.json if it is not already there
					}
					this.settings.tabGroupIds = [...new Set(this.settings.tabGroupIds)];												// remove dupe IDs if necessary
					this.settings.tabGroupIds.sort();																					// sort the tabGroupIds
					this.saveSettings();																								// save the settings
			}
		}
		// INITIALIZE CONTINUOUS MODE = add continuous mode class to workspace tab groups from plugin settings
		const initContinuousMode = () => {
			if ( this.settings.tabGroupIds ) {																							// if there are any saved tabGroupIds...
				this.settings.tabGroupIds.forEach( tab_group_id => {																	// for each id...
					if ( this.app.appId === tab_group_id.split('_')[0] ) {																// if the tabgroup belongs to the current app (window)...
						toggleContinuousMode(tab_group_id,true);																		// toggle continuous mode
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
		// SCROLL ACTIVE LEAF INTO VIEW
		const scrollActiveLeafIntoView = (e) => {
			let view_type = getActiveLeaf().view.getViewType(), offset_top;
			switch(true) {
				case ( /pdf/.test(view_type) ):
					offset_top = getActiveLeaf().view.headerEl.offsetHeight
								+ getActiveLeaf().view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.offsetHeight
								+ ( getActiveLeaf().view.containerEl.offsetTop || 0 ) 
								+ ( getActiveLeaf().view.viewer?.containerEl?.querySelector('.focused_page')?.offsetTop || 0 );								break;
				case ( /canvas/.test(view_type) ):	offset_top = getActiveLeaf()?.view?.headerEl?.offsetTop + getActiveLeaf().view.headerEl.offsetHeight;		break;
				default: 							offset_top = getActiveLeaf()?.view?.headerEl?.offsetTop;													break;
			}
			getActiveLeaf()?.containerEl.closest('.workspace-tab-container')?.scrollTo(0,(offset_top || 0) - 2);
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
			if ( getActiveLeaf()?.containerEl?.closest('.workspace-split.mod-root') === null && !getActiveEditor()?.hasFocus() ) { return; }	// return if not in leaf editor or editor not focussed
			if ( getActiveLeaf().containerEl.closest('.workspace-split.mod-root') === null && !getActiveEditor()?.hasFocus() ) { return; }	// return if not in leaf editor or editor not focussed
			let cursorAnchor = getActiveEditor()?.getCursor('anchor');
			let activeTabGroupChildren = getActiveLeaf().workspace.activeTabGroup.children;
console.log(this.app.workspace.getLeavesOfType('file-explorer')[0].view.fileItems);
			switch(e.key) {
				case 'ArrowUp': case 'ArrowLeft':
					switch(true) {
						case ( /html/.test(getActiveLeaf().view.getViewType()) && e.key === 'ArrowLeft' ): 
								getActiveLeaf().containerEl.querySelector('iframe').focus();
								getActiveLeaf().containerEl.querySelector('iframe').contentWindow.scrollBy({top:-250,left:0,behavior:'smooth'});			
								break;
						case ( /pdf/.test(getActiveLeaf().view.getViewType()) && e.key === 'ArrowLeft' ):		pdfPageNavigation(e);					break;
						case ( /pdf/.test(getActiveLeaf().view.getViewType()) && e.key === 'ArrowUp' ):
								getActiveLeaf().view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
						 		getActiveLeaf().view.viewer.containerEl.querySelector('.focused_page')?.classList.remove('focused_page');				// nobreak
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
						case ( /html/.test(getActiveLeaf().view.getViewType()) && e.key === 'ArrowRight' ): 
								getActiveLeaf().containerEl.querySelector('iframe').focus();
								getActiveLeaf().containerEl.querySelector('iframe').contentWindow.scrollBy({top:250,left:0,behavior:'smooth'});			
								break;
						case ( /pdf/.test(getActiveLeaf().view.getViewType()) && e.key === 'ArrowRight' ):		pdfPageNavigation(e);					break;
						case ( /pdf/.test(getActiveLeaf().view.getViewType()) && e.key === 'ArrowDown' ):
								getActiveLeaf().view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
						 		getActiveLeaf().view.viewer.containerEl.querySelector('.focused_page')?.classList.remove('focused_page');				// nobreak
						case ( cursorAnchor?.ch === getActiveEditor()?.getLine(getActiveEditor().lastLine()).length && cursorAnchor?.line === getActiveEditor()?.lineCount() - 1 ):
						case getActiveLeaf().getViewState().state.mode === 'preview':																	// leaf is in preview mode
						case (!/markdown/.test(getActiveLeaf().getViewState().type)):																	// make next leaf active 
							this_workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(getActiveLeaf()) + 1] || getActiveLeaf()),{focus:true}); 
							break;
					}
					break;
			} 
			// scroll non-md leaves into view; this allows default arrow navigation scrolling in md notes; allows pdf pages to be navigated:
			if ( !/markdown/.test(getActiveLeaf().view.getViewType()) ) { scrollActiveLeafIntoView(e); }	
		}
		// PDF PAGE NAVIGATION
		function pdfPageNavigation(e) {
			let focused_page = getActiveLeaf().view.viewer.containerEl.querySelector('.focused_page');
			let pdf_pages = getActiveLeaf().view.viewer.child.pdfViewer.pdfViewer._pages;
			let activeTabGroupChildren = getActiveLeaf().workspace.activeTabGroup.children;
			switch(true) {
				case ( e.key === 'ArrowRight' ):
					switch(true) {
						case focused_page === null:					 pdf_pages[0].div.classList.add('focused_page'); 					break;	// add class to first page
						case focused_page.nextSibling !== null: 	 focused_page.nextSibling.classList.add('focused_page');					// add class to next page
																	 focused_page.classList.remove('focused_page');						break;	// remove class from previous page
						case focused_page.nextSibling === null:		 focused_page.classList.remove('focused_page');								// remove class from last page
							 this_workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(getActiveLeaf()) + 1] || getActiveLeaf()),{focus:true});	// focus next leaf
							 scrollActiveLeafIntoView();																				break;
					}																													break;
				case ( e.key === 'ArrowLeft' ):
					switch(true) {
						case focused_page === null:					 pdf_pages[pdf_pages.length - 1].div.classList.add('focused_page');	break;	// add class to last page
						case focused_page.previousSibling !== null:	 focused_page.previousSibling.classList.add('focused_page');				// add class to previous page
																	 focused_page.classList.remove('focused_page');						break;	// remove class from last page
						case focused_page.previousSibling === null:	 focused_page.classList.remove('focused_page');								// remove class from first page
							 this_workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(getActiveLeaf()) - 1] || getActiveLeaf()),{focus:true});	// focus previous leaf
							 scrollActiveLeafIntoView();																				break;
					}																													break;
			}
			getActiveLeaf().view.viewer?.containerEl?.querySelector('.pdf-toobar')?.click();	// needed to focus pdf viewer and enable proper page navigation by arrow keys
		}
		// OPEN FOLDER IN CONTINUOUS MODE
		const openFolderInContinuousMode = (file,direction) => { 
			let folder, new_tab, pinned_tabs = [], bool = ( direction === 'left' ? false : true);
			folder = ( file instanceof obsidian.TFile ? file.parent : file instanceof obsidian.TFolder ? file : null);	// allows opening from folder as well as a file items
			switch(true) {
				case folder.children.length > 99 && !window.confirm('You are about to open '+ folder.children.length +'. Are you sure you want to do this?'): return;	// warn on opening > 99 notes
				case folder.children.length === 0: 																		return alert('Folder is empty.');				// folder is empty
				case folder.children.every( child => !/md|bmp|jpg|jpeg|gif|pdf|png|svg|webp/.test(child.extension) ):	return alert('No readable files in folder.');	// no readable files
			}
			this_workspace.iterateRootLeaves( leaf => {
				if ( leaf.pinned === true ) {  pinned_tabs.push(leaf.id) } else { leaf.setPinned(true); }	// get list of already pinned tabs, else pin unpinned tabs
			});
			let new_split = this_workspace.createLeafBySplit(this_workspace.rootSplit,'vertical',bool);	// create new split before active split; bool === false => open split on left
			this_workspace.setActiveLeaf(this_workspace.getLeafById(new_split.id),{focus:true});		// focus new split
			// folder.children.sort((a,b) => a.name.localeCompare(b.name),navigator.language);			// sort files by name; change to allow other sorts? or add sorting elsewhere?
			folder.children.forEach( child => {
				if ( child instanceof obsidian.TFile && /md|bmp|jpg|jpeg|gif|pdf|png|svg|webp/.test(child.extension) ) {
					new_tab = this_workspace.getLeaf();													// open new tab/leaf
					new_tab.openFile(child);															// open file
					new_tab.setPinned(true);															// pin tab to prevent Obsidian reusing it to open next file in loop
				}
			});
			this_workspace.iterateRootLeaves( leaf => {
				if ( !pinned_tabs.includes(leaf.id) ) { leaf.setPinned(false); }						// unpin tabs, except for previously pinned tabs
			});
			getActiveTabGroup().containerEl.classList.add('is_continuous_mode'); 
			toggleContinuousMode(this.app.appId +'_'+getActiveTabGroup().id)
			this_workspace.setActiveLeaf(getActiveTabGroup().children[0]);
			scrollActiveLeafIntoView();
		 }		
  		
		// REGISTER EVENTS
		this.registerDomEvent(document,'click', function (e) {
			switch(true) {
				case !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode'):									return; 
				case ( /workspace-tab-header/.test(e.target.className) ):								scrollActiveLeafIntoView();		break;
			}
		});
		this.registerDomEvent(document,'keydown', function (e) {
			if ( e.target.tagName === 'body' )													 							{ return; }	// do nothing if tab group is not active
			if ( !getActiveLeaf().containerEl.closest('.workspace-tabs')?.classList.contains('is_continuous_mode') )		{ return; }	// do nothing if continuous mode is not active in tab group
			if ( /Arrow/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ) { leafArrowNavigation(e); }				// else arrow navigation			
		});	
		this.registerDomEvent(document,'dragstart',function(e) { 
			if ( !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode')) { return; }
			if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }	// get initial tab header index for onTabHeaderDragEnd()
		});
		// ADD CONTEXTUAL MENU ITEMS
		const addContinuousModeMenuItem = (item,tab_group_id) => {
			item.setTitle('Continuous mode')
				.setIcon('book-down')
				.setSection('pane')
				.setSubmenu().addItem((item2) => {
					item2.setTitle('Toggle Continuous Mode')
					.setChecked( getTabGroupById(tab_group_id).containerEl.classList.contains('is_continuous_mode') ? true : false )
					.onClick(async () => { 
						toggleContinuousMode(tab_group_id);
					})
				})
				.addItem((item3) => {
					item3.setTitle( getTabGroupById(tab_group_id).containerEl.classList.contains('hide_note_titles') ? 'Show note headers' : 'Hide note headers' )
					.onClick(async () => { 
						getActiveTabGroup().containerEl.classList.toggle('hide_note_titles');
					})
				})
		}
		const addContinuousModeFileExplorerItem = (item,file) => {
			item.setTitle('Continuous mode')
				.setIcon('book-down')
				.setSection('pane')
				.setSubmenu().addItem((item2) => {
					item2.setTitle('Open folder in left split')
					.onClick(async () => { 
						openFolderInContinuousMode(file,'left');
					})
				})
				.addItem((item3) => {
					item3.setTitle('Open folder in right split')
					.onClick(async () => { 
						openFolderInContinuousMode(file,'right');
					})
				})
		}		
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu,file,source,leaf) => {
				switch(true) {
					case source !== 'file-explorer-context-menu':
						menu.addItem((item) => { 
							addContinuousModeMenuItem(item,leaf.containerEl.closest('.workspace-tabs').dataset.tab_group_id) 
						});
						break;
					case source === 'file-explorer-context-menu':
						menu.addItem((item) => {
							addContinuousModeFileExplorerItem(item,file)
						});
						break;
				}
			})
		)
		this.registerEvent(
			this.app.workspace.on('file-explorer-menu', (menu,file) => {
				menu.addItem((item) => { addContinuousModeMenuItem(item,editor.containerEl.closest('.workspace-tabs').dataset.tab_group_id) });
			})
		);
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu,editor) => {
				menu.addItem((item) => { addContinuousModeMenuItem(item,editor.containerEl.closest('.workspace-tabs').dataset.tab_group_id) });
			})
		);
		this.registerEvent(
			this.app.workspace.on('tab-group-menu', (menu,tab_group) => {
				menu.addItem((item) => { addContinuousModeMenuItem(item,tab_group.containerEl.dataset.tab_group_id) });
			})
		);
		this.registerEvent(													// initContinuousMode on layout change
			this.app.workspace.on('layout-change', async () => { 
//				updateTabGroupDatasetIds(); 
//				cleanDataTabGroupIds(); 									// disabled
//				initContinuousMode();
			})
		);
		this.app.workspace.onLayoutReady( async () => {						// initContinuousMode on layout ready
			updateTabGroupDatasetIds(); 
			cleanDataTabGroupIds();											// disabled
			initContinuousMode();
			scrollActiveLeafIntoView();
		})
		// ADD COMMAND PALETTE ITEMS
		this.addCommand({																				// add command: toggle continuous mode in active tab group
			id: 'toggle-continuous-mode-active',
			name: 'Toggle continuous mode in active tab group',
			callback: () => { toggleContinuousMode(getActiveTabGroup().containerEl.dataset.tab_group_id); },
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
