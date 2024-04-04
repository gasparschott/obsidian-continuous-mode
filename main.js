'use strict';

let obsidian = require('obsidian');

let DEFAULT_SETTINGS = {
	'folderFileTypes':[],
	'extraFileTypes':[],
	'excludedNames':[],
	'tabGroupIds': []
};

class ContinuousModePlugin extends obsidian.Plugin {
    async onload() {
		console.log('Loading the Continuous Mode plugin.');
		await this.loadSettings();
		this.addSettingTab(new ContinuousModeSettings(this.app, this));
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
		updateTabGroupDatasetIds(); // disabled
		/* ----------------------- */
		// TOGGLE CONTINUOUS MODE
		const toggleContinuousMode = (tab_group_id,bool) => {
			const active_floating_tab_group = () => { return this.app.workspace.floatingSplit?.children[0]?.children?.filter( child => child.containerEl.classList.contains('mod-active'))[0]; }
			const isFloatingWindow = () => { return this.app.workspace.floatingSplit?.children?.length > 0 && active_floating_tab_group() !== undefined; }
			switch(true) {
				case isFloatingWindow():	active_floating_tab_group().containerEl.classList.toggle('is_continuous_mode');		break;	// if floating window, don't save tabGroupIds
				case this.app.appId === tab_group_id?.split('_')[0]:
					switch(true) {
						case getTabGroupById(tab_group_id)?.containerEl?.classList.contains('is_continuous_mode') && bool !== true:		// if tab group is in continuous mode, remove continuous mode
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
								+ ( getActiveLeaf().view.viewer?.containerEl?.querySelector('.focused_pdf_page')?.offsetTop || 0 );								break;
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
			switch(true) {																											// Ignore arrow navigation function in these cases:
				case getActiveLeaf()?.containerEl?.closest('.workspace-split.mod-root') === null && !getActiveEditor()?.hasFocus():			// return if not in leaf editor or editor not focussed
				case e.target.querySelector('.canvas-node.is-focused') && /Arrow/.test(e.key): 												// return if editing canvas
				case e.target.querySelector('.workspace-leaf-content[data-set="graph"]') && /Arrow/.test(e.key) && e.shiftKey:		return;	// return if graph active; use shift key to move graph
				default: e.preventDefault();																								// else prevent normal arrow behavior
			}
			let cursorAnchor = getActiveEditor()?.getCursor('anchor');
			let activeTabGroupChildren = getActiveLeaf().workspace.activeTabGroup.children;
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
						 		getActiveLeaf().view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');				// nobreak
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
						 		getActiveLeaf().view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');				// nobreak
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
			let focused_pdf_page = getActiveLeaf().view.viewer.containerEl.querySelector('.focused_pdf_page');
			let pdf_pages = getActiveLeaf().view.viewer.child.pdfViewer.pdfViewer._pages;
			let activeTabGroupChildren = getActiveLeaf().workspace.activeTabGroup.children;
			switch(true) {
				case ( e.key === 'ArrowRight' ):
					switch(true) {
						case focused_pdf_page === null:					 pdf_pages[0].div.classList.add('focused_pdf_page'); 					break;	// add class to first page
						case focused_pdf_page.nextSibling !== null: 	 focused_pdf_page.nextSibling.classList.add('focused_pdf_page');				// add class to next page
																		 focused_pdf_page.classList.remove('focused_pdf_page');					break;	// remove class from previous page
						case focused_pdf_page.nextSibling === null:		 focused_pdf_page.classList.remove('focused_pdf_page');							// remove class from last page
							 this_workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(getActiveLeaf()) + 1] || getActiveLeaf()),{focus:true});	// focus next leaf
							 scrollActiveLeafIntoView();																						break;
					}																															break;
				case ( e.key === 'ArrowLeft' ):
					switch(true) {
						case focused_pdf_page === null:					 pdf_pages[pdf_pages.length - 1].div.classList.add('focused_pdf_page');	break;	// add class to last page
						case focused_pdf_page.previousSibling !== null:	 focused_pdf_page.previousSibling.classList.add('focused_pdf_page');			// add class to previous page
																		 focused_pdf_page.classList.remove('focused_pdf_page');					break;	// remove class from last page
						case focused_pdf_page.previousSibling === null:	 focused_pdf_page.classList.remove('focused_pdf_page');							// remove class from first page
							 this_workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(getActiveLeaf()) - 1] || getActiveLeaf()),{focus:true});	// focus previous leaf
							 scrollActiveLeafIntoView();																						break;
					}																															break;
			}
			getActiveLeaf().view.viewer?.containerEl?.querySelector('.pdf-toobar')?.click();	// needed to focus pdf viewer and enable proper page navigation by arrow keys
		}
		// OPEN FOLDER IN CONTINUOUS MODE
		const openFolderInContinuousMode = (file,direction) => { 
			let folder, active_split, new_split, new_tab, pin_leaf = true, pinned_tabs = [], bool = ( direction === 'left' ? false : direction === 'right' ? true : direction);
			folder = ( file instanceof obsidian.TFile ? file.parent : file instanceof obsidian.TFolder ? file : null);	// allows opening from folder as well as a file items
			const isEmpty = (leaf) => { return leaf.getViewState().type === 'empty' }
			let included_extensions = [];
			let extensions = { 
				markdown:['md'],
				images:['avif','bmp','jpg','jpeg','gif','^png','svg','webp'],
				canvas:['canvas'],
				media:['aac','aif','aiff','ape','flac','m4a','mka','mp3','ogg','opus','wav','m4v','mkv','mov','mp4','mpeg','webm'],
				pdf:['pdf'],
				extra:this.settings.extraFileTypes
			};
			for (const [key, value] of Object.entries(extensions)) {
				if ( this.settings.folderFileTypes.includes(key) ) { included_extensions.push(value); }				// build array of arrays of valid file types
			}
			included_extensions = new RegExp(included_extensions.flat().join('|'),'im');									// flatten array and convert list of valid file types into RegExp string
			switch(true) {
				case folder.children.length > 99 && !window.confirm('You are about to open '+ folder.children.length +'. Are you sure you want to do this?'): return;	// warn on opening > 99 notes
				case folder.children.length === 0: 																return alert('Folder is empty.');						// folder is empty
				case folder.children.every( child => ( !included_extensions.test(child.extension) || this.settings.excludedNames.some( name => { return RegExp(name,'m').test(child.name) } ) ) ): 
																												return alert('No readable files in folder.');			// no readable files
			}
			this_workspace.iterateRootLeaves( leaf => {															// pin tabs to prevent reuse, i.e., coerce new tab creation
				if ( leaf.pinned === true ) { pinned_tabs.push(leaf.id) } else { leaf.setPinned(true) }			// make list of already pinned tabs or pin all unpinned tabs
			});
			switch(true) {
				case bool === 'append':																			// append items to active tab group
					this_workspace.setActiveLeaf(this_workspace.getMostRecentLeaf(),{focus:true});				// set most recent leaf to active
					if ( getActiveLeaf().parent.children.length === 1 && isEmpty(getActiveLeaf()) ) { this_workspace.activeLeaf.setPinned(false); } 	// unpin single active empty leaf
					folder.children.forEach( file => {
						getActiveTabGroup().children.forEach( leaf => {
							if ( file === leaf.view.file ) { folder.children.splice(folder.children.indexOf(leaf.view.file,1)) } 						// don't duplicate open files
						});	
					});
					break;
				case bool === 'replace':																		// close all leaves
					this_workspace.setActiveLeaf(this_workspace.getMostRecentLeaf(),{focus:true});
					getActiveTabGroup().children.forEach( child => { 
						sleep(0).then( () => { 
							child.setPinned(false); 
							child.detach(); 
						}); 
					});																							// unpin & close all leaves in active tab group
					break;
				default:																						// create new split left/right/up/down
					new_split = ( direction === 'down' ? this_workspace.createLeafBySplit(this_workspace.getMostRecentLeaf(),'horizontal',false) : direction === 'up' ? this_workspace.createLeafBySplit(this_workspace.getMostRecentLeaf(),'horizontal',true) : this_workspace.createLeafBySplit(this_workspace.rootSplit,'vertical',bool) );
					this_workspace.setActiveLeaf(this_workspace.getLeafById(new_split.id),{focus:true});		// focus new split
					active_split = new_split;
					break;
			}
			// folder.children.sort((a,b) => a.name.localeCompare(b.name),navigator.language);					// sort files by name; change to allow other sorts? or add sorting elsewhere?
			folder.children.forEach( child => {																	// open the files
				if ( this.settings.excludedNames.some( name => { return RegExp(name,'m').test(child.name) } ) ) { return } // ignore excluded file names
					else
				if ( child instanceof obsidian.TFile && ( included_extensions.test(child.extension) || this.settings.extraFileTypes.includes(child.extension) ) ) {
					active_split = this_workspace.getLeaf();													// open new tab/leaf
					active_split.openFile(child);																// open file
					active_split.setPinned(true);																// pin new tab/leaf to prevent Obsidian reusing it to open next file in loop
				}
			});
			this_workspace.iterateRootLeaves( leaf => {
				if ( !pinned_tabs.includes(leaf.id) ) { leaf.setPinned(false); }								// unpin all tabs, except for originally pinned tabs
			});
			toggleContinuousMode(this.app.appId +'_'+getActiveTabGroup().id,true)								// enable continuous mode
			this_workspace.setActiveLeaf(getActiveTabGroup().children[0]);										// set active leaf
			scrollActiveLeafIntoView();																			// scroll into view
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
			if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }					// get initial tab header index for onTabHeaderDragEnd()
		});
		// ADD CONTEXTUAL MENU ITEMS
		const icons = {
			appendFolder: `<svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-down" version="1.1" id="svg2" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"> <defs id="defs2" /> <rect width="18" height="18" x="3" y="3" rx="2" id="rect1" /> <path d="m 12,8 v 8" id="path1" /> <path d="m 8,12 4,4 4,-4" id="path2" /> <path d="M 15.999999,8 H 8" id="path1-2" /></svg>`,
			panelTopDashed: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-top-dashed"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M14 9h1"/><path d="M19 9h2"/><path d="M3 9h2"/><path d="M9 9h1"/></svg>`,
			replaceFolder: `<svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-down" version="1.1" id="svg2" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"> <defs id="defs2" /> <rect width="18" height="18" x="3" y="3" rx="2" id="rect1" /> <path d="m 8,14 4,4 4,-4" id="path2" /> <path d="m 8,9.9999586 4,-4 4,4" id="path2-3" /></svg>`
		} 
		const addIcons = () => {
		  Object.keys(icons).forEach((key) => {
			  (0, obsidian.addIcon)(key, icons[key]);
		  });
		};
		addIcons();
		const addContinuousModeMenuItem = (item,tab_group_id,leaf) => {
			item.setTitle('Continuous Mode')
				.setIcon('scroll-text')
				.setSection( leaf ? 'pane' : 'action' )
				.setSubmenu().addItem((item2) => {
					item2.setTitle('Toggle Continuous Mode')
					.setIcon('scroll-text')
					.setChecked( getTabGroupById(tab_group_id).containerEl.classList.contains('is_continuous_mode') ? true : false )
					.onClick(async () => { 
						toggleContinuousMode(tab_group_id || this.app.appId+'_'+getActiveTabGroup().id);
					})
				})
				.addItem((item3) => {
					item3.setTitle( getTabGroupById(tab_group_id).containerEl.classList.contains('hide_note_titles') ? 'Show note headers' : 'Hide note headers' )
					.setIcon('panelTopDashed')
					.setDisabled( getTabGroupById(tab_group_id).containerEl.classList.contains('is_continuous_mode') ? false : true )
					.onClick(async () => { 
						getActiveTabGroup().containerEl.classList.toggle('hide_note_titles');
					})
				})
		}
		const openItemsInContinuousModeMenuItems = (item,file) => {
			item.setTitle('Continuous Mode')
				.setIcon('scroll-text')
				.setSection('action')
				.setSubmenu().addItem((item2) => {
					item2.setTitle('Open folder in new split left')
					.setIcon('panel-left-close')
					.onClick(async () => { 
						openFolderInContinuousMode(file,'left');
					})
				})
				.addItem((item3) => {
					item3.setTitle('Open folder in new split right')
					.setIcon('panel-right-close')
					.onClick(async () => { 
						openFolderInContinuousMode(file,'right');
					})
				})
				.addItem((item4) => {
					item4.setTitle('Open folder in new split down')
					.setIcon('panel-bottom-close')
					.onClick(async () => { 
						openFolderInContinuousMode(file,'down');
					})
				})
				.addItem((item5) => {
					item5.setTitle('Open folder in new split up')
					.setIcon('panel-top-close')
					.onClick(async () => { 
						openFolderInContinuousMode(file,'up');
					})
				})
				.addSeparator()
				.addItem((item6) => {
					item6.setTitle('Open or append folder in active tab group')
					.setIcon('appendFolder')
					.onClick(async () => { 
						openFolderInContinuousMode(file,'append');
					})
				})
				.addItem((item7) => {
					item7.setTitle('Replace active tab group with folder')
					.setIcon('replaceFolder')
					.onClick(async () => {
						if ( window.confirm('Warning: This will close all open notes in the active tab group. Are you sure you want to do this?') ) { openFolderInContinuousMode(file,'replace') }
					})
				})
		}		
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu,file,source,leaf) => {
				switch(true) {
					case source !== 'file-explorer-context-menu':
						menu.addItem((item) => { 
							addContinuousModeMenuItem(item,leaf.containerEl.closest('.workspace-tabs').dataset.tab_group_id,leaf)
						});
						break;
					case source === 'file-explorer-context-menu':
						menu.addItem((item) => {
							openItemsInContinuousModeMenuItems(item,file)
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
				updateTabGroupDatasetIds();
				initContinuousMode();
				scrollActiveLeafIntoView();
			})
		);
		this.registerEvent(
			this.app.workspace.on('layout-ready', async () => {				// initContinuousMode on layout ready
				updateTabGroupDatasetIds(); 
				initContinuousMode();
				scrollActiveLeafIntoView();
			})
		);
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
} // end class ContinuousModePlugin
// SETTINGS
let ContinuousModeSettings = class extends obsidian.PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	display() {
		const { containerEl } = this;
		containerEl.empty();
        this.containerEl.createEl("h2", { text: '“Open folder in Continuous Mode” menu: filter included file types' })
		this.containerEl.createEl('p', { text: 'Select file types to include when using the various “Open folder in Continuous Mode” contextual menu items in the file explorer. (Note: toggling off these settings does not prevent any of these file types from being opened manually.)'});
		new obsidian.Setting(containerEl).setName('Include markdown').setDesc('Default.').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.folderFileTypes.length === 0 ? true : this.plugin.settings.folderFileTypes.includes('markdown'))
			.onChange(async (value) => {
				(value === true || this.plugin.settings.folderFileTypes.length === 0 ? this.plugin.settings.folderFileTypes.push('markdown') : this.plugin.settings.folderFileTypes.splice(this.plugin.settings.folderFileTypes.indexOf('markdown'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include images').setDesc('Natively supported file types: avif, bmp, gif, jpg, png, svg, webp.').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.folderFileTypes.includes('images'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.folderFileTypes.push('images') : this.plugin.settings.folderFileTypes.splice(this.plugin.settings.folderFileTypes.indexOf('images'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include canvas files').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.folderFileTypes.includes('canvas'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.folderFileTypes.push('canvas') : this.plugin.settings.folderFileTypes.splice(this.plugin.settings.folderFileTypes.indexOf('canvas'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include media').setDesc('Natively supported file types: aac, aif, aiff, ape, flac, m4a, mka, mp3, ogg, opus, wav, m4v, mkv, mov, mp4, mpeg, webm.').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.folderFileTypes.includes('media'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.folderFileTypes.push('media') : this.plugin.settings.folderFileTypes.splice(this.plugin.settings.folderFileTypes.indexOf('media'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include pdfs').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.folderFileTypes.includes('pdf'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.folderFileTypes.push('pdf') : this.plugin.settings.folderFileTypes.splice(this.plugin.settings.folderFileTypes.indexOf('pdf'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include other file extensions').setDesc('If you have installed plugins that allow Obsidian to support file types or extensions not included above, add the file extensions here, comma-separated.').setClass("setting-indent")
			.addText((value) => value.setPlaceholder("e.g. html, js, py, etc.").setValue(this.plugin.settings.extraFileTypes.join(','))
			.onChange(async (value) => {
				( !this.plugin.settings.extraFileTypes.includes(value) ? this.plugin.settings.extraFileTypes = value.split(',') : null );	// add extra file extensions
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Excluded files').setDesc('Exclude files by name (including extension). Comma-separated, case-sensitive, partial name and Regex allowed. (Note: If the file name contains a comma, use a period [wildcard character] here instead.) Extensions added here will override the settings in the above categories.').setClass("setting-indent")
			.addText((value) => value.setPlaceholder("e.g., “index.md”").setValue(this.plugin.settings.excludedNames.join(','))
			.onChange(async (value) => {
				( !this.plugin.settings.excludedNames.includes(value) ? this.plugin.settings.excludedNames = value.split(',') : null );		// add excluded name if not already used
				this.plugin.settings.excludedNames.forEach( name => { if ( name.length === 0 ) { this.plugin.settings.excludedNames.splice(this.plugin.settings.excludedNames.indexOf(name),1) } } )
				await this.plugin.saveSettings();
		}));
        this.containerEl.createEl("h2", { text: "Other" });
		new obsidian.Setting(containerEl).setName('Clear stored data').setDesc('Empty the list of stored tab groups, ignoring currently open tab groups with continuous mode active. This optional action prevents the list from getting unwieldy or cluttered with stale data, which can happen if you frequently open and close new tab groups.')
			.addButton((button) => {
				button.setButtonText('Clear');
				button.buttonEl.addEventListener("click", async (e) => {
					if ( window.confirm('Are you sure you want to clear all stored data?') ) {
						this.plugin.settings.tabGroupIds = [];																				// empty stored tabGroupIds
						this.app.workspace.rootSplit.children.forEach( child => { ( child.containerEl.classList.contains('is_continuous_mode') ? this.plugin.settings.tabGroupIds.push(this.app.appId +'_'+ child.id) : null ) }); 																												// add back currently active tabGroupIds
						await this.plugin.saveSettings();
					}
				})
		});
		new obsidian.Setting(containerEl).setName('Donate').setDesc('If you like this plugin, please consider donating to support continued development.')
			.addButton((button) => {
				button.buttonEl.setAttr("style", "background-color: transparent; height: 30pt; padding: 0px;");
				const div = button.buttonEl.createDiv({ attr: { "style": "width: 100%; height: 100%" } });
				div.createEl("a", { href: "https://www.buymeacoffee.com/fiLtliTFxQ" }).createEl("img", {
					attr: {
						style: "width: 100%; height: 100%",
						src: 'https://cdn.buymeacoffee.com/buttons/v2/default-violet.png',
						alt: 'Buy Me A Coffee'
					}
				});
		});
	} // end display()
};
module.exports = ContinuousModePlugin;
