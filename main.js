'use strict';

let obsidian = require('obsidian');

let DEFAULT_SETTINGS = {
	'folderFileTypes':['markdown'],
	'extraFileTypes':[],
	'excludedNames':[],
	'tabGroupIds': [],
	'disableScrollActiveLeafIntoView': false
};
class ContinuousModePlugin extends obsidian.Plugin {
    async onload() {
		console.log('Loading the Continuous Mode plugin.');
		await this.loadSettings();
		this.addSettingTab(new ContinuousModeSettings(this.app, this));
		/* ----------------------- */
		// HELPERS
		const getAllTabGroups = () => {
			let nodes = (this.app.workspace.floatingSplit?.children || []).concat(this.app.workspace.rootSplit?.children || []);
			let all_tab_groups = [];
			nodes.forEach( node => { if ( node.type === 'tabs' ) { all_tab_groups.push(node) } else { all_tab_groups = getTabGroupsRecursively(node,all_tab_groups) } });
			return all_tab_groups;
		}
		const getTabGroupsRecursively = (begin_node,all_tab_groups) => {
			let all_children = begin_node?.children;
			if ( all_children === undefined ) { return }
			all_tab_groups = all_tab_groups || [];
			if ( begin_node.children ) {
				begin_node.children.forEach(function(child) {
					if (child.type === 'tabs') { all_tab_groups.push(child); }
					all_children = all_children.concat(getTabGroupsRecursively(child,all_tab_groups));
				});
			}
			return all_tab_groups;
		}
		const getAllLeaves = () => {
			let all_leaves = [];
			getAllTabGroups().forEach(tab_group => { all_leaves.push(...tab_group.children) })
			return all_leaves;
		}
		const this_workspace =					this.app.workspace; 
		const getActiveTabGroup = () =>			{ return this_workspace.activeTabGroup; }
		const getTabGroupByDataId = (id) =>		{ return getAllTabGroups()?.find( tab_group => tab_group.containerEl.dataset.tab_group_id === id ); }
		const getTabGroupHeaders = () =>		{ return this_workspace.activeTabGroup.tabHeaderEls; }
		const getTabHeaderIndex = (e) =>		{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
		const getActiveLeaf = () =>				{ return this_workspace.activeLeaf; }
		const getActiveEditor = () =>			{ return this_workspace.activeEditor?.editor; }
		const getActiveFloatingTabGroup = () => { return this.app.workspace.floatingSplit?.children[0]?.children?.filter( child => child.containerEl.classList.contains('mod-active'))[0]; }
		const isFloatingWindow = () => 			{ return this.app.workspace.floatingSplit?.children?.length > 0 && getActiveFloatingTabGroup() !== undefined; }
		const updateTabGroupDatasetIds = obsidian.debounce( () => {
			getAllTabGroups().forEach( tab_group => { tab_group.containerEl.dataset.tab_group_id = this.app.appId +'_'+ tab_group.id });
		},25,true);
		updateTabGroupDatasetIds();
		/* ----------------------- */
		// TOGGLE CONTINUOUS MODE
		const toggleContinuousMode = (tab_group_id,bool) => {
					if ( this.app.appId === tab_group_id?.split('_')[0] ) {
				switch(true) {
					case getTabGroupByDataId(tab_group_id)?.containerEl?.classList.contains('is_continuous_mode') && bool !== true:	// if tab group is in continuous mode, remove continuous mode
						getTabGroupByDataId(tab_group_id)?.containerEl?.classList.remove('is_continuous_mode');						// remove style
						this.settings.tabGroupIds.splice(this.settings.tabGroupIds.indexOf(tab_group_id),1);						// remove tabGroupdId from data.json
						break;
					default:																										// if tab group is not in continuous mode (e.g., on app launch)
						getTabGroupByDataId(tab_group_id)?.containerEl?.classList.add('is_continuous_mode');						// add style
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
		/*-----------------------------------------------*/
		// DRAG TAB HEADERS to Rearrange Leaves on dragstart
		const onTabHeaderDragEnd = (e,initial_tab_header_index) => {
			e.target.ondragend = function(f) { 
				if ( getTabHeaderIndex(f) !== initial_tab_header_index ) { rearrangeLeaves(f,initial_tab_header_index); }	// only rearrange leaves if tab header is actually moved to a new position
			}
		}
		// REARRANGE LEAVES on dragend
		const rearrangeLeaves = (e,initial_tab_header_index) => {
			let leaves_container = e.target.closest('.workspace-tabs').querySelector('.workspace-tab-container');			// get current tab container
			let leaves = Array.from(leaves_container.children);																// get current tab container leaves
			let final_tab_header_index = getTabHeaderIndex(e);																// get final dropped tab header index
			let moved = leaves.splice(initial_tab_header_index,1);															// get the moved leave
			let rearranged = leaves.toSpliced(final_tab_header_index,0,moved[0]);											// move the moved leaf into position
			leaves_container.setChildrenInPlace(rearranged);																// replace tab container content with rearranged leaves
			getTabGroupHeaders()[final_tab_header_index].click();															// confirm drag and focus leaf by clicking tab
		}
		// SCROLL ACTIVE LEAF INTO VIEW
		const scrollActiveLeafIntoView = obsidian.debounce( (bool) => {
			let active_leaf = getActiveLeaf(), active_editor = active_leaf.view.editor;
			if (!active_leaf) { return }
			let view, view_type = active_leaf.view.getViewType(), offset_top = 0;
			switch(true) {
				case ( bool === true && active_editor && active_editor.editorComponent.type === 'source' && this.settings.disableScrollActiveLeafIntoView === false ): 
					active_editor.scrollIntoView({from:active_editor.getCursor('from'),to:active_editor.getCursor('to')},true);											break;
				case ( /pdf/.test(view_type) ): 	offset_top = active_leaf?.view?.containerEl?.offsetTop;																break;
				default:							offset_top = active_leaf?.view?.headerEl?.offsetTop;																break;
			}
			if ( bool === false || !/markdown/.test(view_type) || (/markdown/.test(view_type) && this.settings.disableScrollActiveLeafIntoView === true) ) {
				active_leaf.containerEl.closest('.workspace-tab-container')?.scrollTo(0,offset_top - 2); 
			}
		},25,true)
		// ARROW NAVIGATION between open leaves
		const leafArrowNavigation = (e) => {
			switch(true) {																											// Ignore arrow navigation function in these cases:
				case ( /input|textarea/.test(document.activeElement.tagName.toLowerCase())):												// return if in input or textarea
				case getActiveLeaf()?.containerEl?.closest('.workspace-split.mod-root') === null && !getActiveEditor()?.hasFocus():			// return if not in leaf editor or editor not focussed
				case e.target.querySelector('.canvas-node.is-focused') && /Arrow/.test(e.key): 												// return if editing canvas
				case e.target.querySelector('.workspace-leaf-content[data-set="graph"]') && /Arrow/.test(e.key) && e.shiftKey:		return;	// return if graph active; use shift key to move graph
				default: e.preventDefault();																								// else prevent normal arrow behavior
			}
			let cursorAnchor = getActiveEditor()?.getCursor('anchor');
			let active_leaf = getActiveLeaf(), activeTabGroupChildren = active_leaf.workspace.activeTabGroup.children;
			switch(e.key) {
				case 'ArrowUp': case 'ArrowLeft':
					switch(true) {
						case ( /html/.test(active_leaf.view.getViewType()) && e.key === 'ArrowLeft' ): 
								active_leaf.containerEl.querySelector('iframe').focus();
								active_leaf.containerEl.querySelector('iframe').contentWindow.scrollBy({top:-250,left:0,behavior:'smooth'});			
								break;
						case cursorAnchor?.line === 0 && cursorAnchor?.ch > 0 && e.key === 'ArrowUp':	getActiveEditor()?.setCursor({line:0,ch:0});	break;	// set cursor to beginning of editor
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowLeft' ):		pdfPageNavigation(e);					break;
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowUp' ):
								active_leaf.view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
						 		active_leaf.view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');		// nobreak
						case e.target.classList.contains('inline-title') && window.getSelection().anchorOffset === 0:									// cursor in inline-title
						case e.target.classList.contains('metadata-properties-heading'):																// cursor in properties header
						case active_leaf.getViewState().state.mode === 'preview':																	// leaf is in preview mode
						case cursorAnchor?.line === 0 && cursorAnchor?.ch === 0:																		// cursor at first line, first char
						case (!/markdown/.test(active_leaf.getViewState().type)):																	// leaf is empty (new tab)
							if ( active_leaf.containerEl.previousSibling !== null ) {																// ignore if first leaf
								this_workspace.setActiveLeaf(activeTabGroupChildren[activeTabGroupChildren.indexOf(active_leaf) - 1],{focus:true});	// make previous leaf active 
								getActiveEditor()?.setCursor({line:getActiveEditor().lastLine(),ch:getActiveEditor().lastLine().length - 1});			// select last char
							}
							break;
					}
					break;
				case 'ArrowDown':	case 'ArrowRight':
					switch(true) {
						case ( /html/.test(active_leaf.view.getViewType()) && e.key === 'ArrowRight' ): 
								active_leaf.containerEl.querySelector('iframe').focus();
								active_leaf.containerEl.querySelector('iframe').contentWindow.scrollBy({top:250,left:0,behavior:'smooth'});			
								break;
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowRight' ):		pdfPageNavigation(e);					break;
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowDown' ):
								active_leaf.view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
						 		active_leaf.view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');				// nobreak
						case ( cursorAnchor?.ch === getActiveEditor()?.getLine(getActiveEditor().lastLine()).length && cursorAnchor?.line === getActiveEditor()?.lineCount() - 1 ):
						case active_leaf.getViewState().state.mode === 'preview':																	// leaf is in preview mode
						case (!/markdown/.test(active_leaf.getViewState().type)):																	// make next leaf active 
							this_workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(active_leaf) + 1] || active_leaf),{focus:true}); 
							break;
					}
					break;
			}
			if ( e.target.cmView && this.settings.disableScrollActiveLeafIntoView === true ) { return } else { scrollActiveLeafIntoView(true); }
		}
		// PDF PAGE NAVIGATION
		function pdfPageNavigation(e) {
			let focused_pdf_page = getActiveLeaf().view.viewer.containerEl.querySelector('.focused_pdf_page');
			let pdf_pages = getActiveLeaf().view.viewer.child.pdfViewer.pdfViewer._pages;
			let activeTabGroupChildren = getActiveLeaf().workspace.activeTabGroup.children;
			let scroll_top = 0;
			switch(true) {
				case ( e.key === 'ArrowRight' ):
					switch(true) {
						case focused_pdf_page === null:					 pdf_pages[0].div.classList.add('focused_pdf_page'); 					break;	// add class to first page
						case focused_pdf_page.nextSibling !== null: 	 focused_pdf_page.nextSibling.classList.add('focused_pdf_page');				// add class to next page
																		 focused_pdf_page.classList.remove('focused_pdf_page');					break;	// remove class from previous page
						case focused_pdf_page.nextSibling === null:		 focused_pdf_page.classList.remove('focused_pdf_page');							// remove class from last page
							 this_workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(getActiveLeaf()) + 1] || getActiveLeaf()),{focus:true});	// focus next leaf
																																				break;
					}																															break;
				case ( e.key === 'ArrowLeft' ):
					switch(true) {
						case focused_pdf_page === null:					 pdf_pages[pdf_pages.length - 1].div.classList.add('focused_pdf_page');	break;	// add class to last page
						case focused_pdf_page.previousSibling !== null:	 focused_pdf_page.previousSibling.classList.add('focused_pdf_page');			// add class to previous page
																		 focused_pdf_page.classList.remove('focused_pdf_page');					break;	// remove class from last page
						case focused_pdf_page.previousSibling === null:	 focused_pdf_page.classList.remove('focused_pdf_page');							// remove class from first page
							 this_workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(getActiveLeaf()) - 1] || getActiveLeaf()),{focus:true});	// focus previous leaf
																																				break;
					}																															break;
			}
			scroll_top = getActiveLeaf().view.viewer?.containerEl?.querySelector('.focused_pdf_page').offsetTop + getActiveLeaf().containerEl?.querySelector('.pdf-toolbar').offsetHeight;
			getActiveLeaf().containerEl?.querySelector('.view-content').scrollTo({left:0,top:scroll_top,behavior:'smooth'});
			getActiveLeaf().view.viewer?.containerEl?.querySelector('.pdf-toobar')?.click();	// needed to focus pdf viewer and enable proper page navigation by arrow keys
		}
		// OPEN FOLDER IN CONTINUOUS MODE
		const openFolderInContinuousMode = (items,action,bool) => {
			let items_length = items.length, open_files = [], included_extensions = [];
			let active_split, new_split, pinned_tabs = [];
			let sort_order = ( bool ? this.app.workspace.getLeavesOfType('search')[0].view.dom.sortOrder : this.app.workspace.getLeavesOfType('file-explorer')[0].view.sortOrder );
			let extensions = { 
				markdown:	['md'],
				images:		['avif','bmp','jpg','jpeg','gif','^png','svg','webp'],
				canvas:		['canvas'],
				media:		['aac','aif','aiff','ape','flac','m4a','mka','mp3','ogg','opus','wav','m4v','mkv','mov','mp4','mpeg','webm'],
				pdf:		['pdf'],
				extra:		this.settings.extraFileTypes
			};
			for (const [key, value] of Object.entries(extensions)) {
				if ( this.settings.folderFileTypes.includes(key) ) { included_extensions.push(value); }			// build array of arrays of valid file types
			}
			included_extensions = new RegExp(included_extensions.flat().join('|'),'im');						// flatten array and convert list of valid file types into RegExp string
			this.app.workspace.getMostRecentLeaf().parent.children.forEach( child => open_files.push(child.view.file) );							// define open files
			const isEmpty = (leaf) => { return leaf.getViewState().type === 'empty' }
			switch(true) {
				case items_length > 99 && !window.confirm('You are about to open '+ items_length +'. Are you sure you want to do this?'): return;	// warn on opening > 99 notes
				case items_length === 0: 																		return alert('Folder is empty.');						// source is empty
				case items.every( item => ( !included_extensions.test(item.extension) || this.settings.excludedNames.some( name => { return RegExp(name,'m').test(item.name) } ) ) ): 
																												return alert('No readable files in folder.');			// no readable files
			}
			getAllLeaves().forEach( leaf => {																	// pin tabs to prevent tab reuse, i.e., coerce new tab creation
				if ( leaf.pinned === true ) { pinned_tabs.push(leaf.id) } else { leaf.setPinned(true) }			// make list of already pinned tabs or pin all unpinned tabs
			});
			switch(true) {
				case action === 'append':																		// append items to active tab group
					this_workspace.setActiveLeaf(this_workspace.getMostRecentLeaf(),{focus:true});				// set most recent leaf to active
					if ( getActiveLeaf().parent.children.length === 1 && isEmpty(getActiveLeaf()) ) { this_workspace.activeLeaf.setPinned(false); } 	// unpin single active empty leaf
					items = items.filter( item => !open_files.includes(item) );									// filter already open files
					break;
				case action === 'replace':																		// close all leaves
					this_workspace.setActiveLeaf(this_workspace.getMostRecentLeaf(),{focus:true});
					getActiveTabGroup().children.forEach( child => { 
						sleep(0).then( () => {																	// needed to prevent detachment failure
							child.setPinned(false);																// unpin all leaves in tab group
							child.detach(); 																	// close all leaves in tab group
						}); 
					});																							// unpin & close all leaves in active tab group
					break;
				default:																						// create new split left/right/up/down
					new_split = ( /down/.test(action) ? this_workspace.createLeafBySplit(this_workspace.getMostRecentLeaf(),'horizontal',false) : /up/.test(action) ? this_workspace.createLeafBySplit(this_workspace.getMostRecentLeaf(),'horizontal',true) : this_workspace.createLeafBySplit(this_workspace.rootSplit,'vertical',(/left/.test(action) ? false : true )) );
					this_workspace.setActiveLeaf(this_workspace.getLeafById(new_split.id),{focus:true});		// focus new split
					active_split = new_split;
					break;
			}
			switch(sort_order) {																						// sort files
				case 'alphabetical':			items.sort((a,b) => a.name.localeCompare(b.name),navigator.language);	break;
				case 'alphabeticalReverse':		items.sort((a,b) => b.name.localeCompare(a.name),navigator.language);	break;
				case 'byModifiedTime':			items.sort((a,b) => b.stat.mtime - a.stat.mtime);						break;
				case 'byModifiedTimeReverse':	items.sort((a,b) => a.stat.mtime - b.stat.mtime);						break;
				case 'byCreatedTime':			items.sort((a,b) => b.stat.ctime - a.stat.ctime);						break;
				case 'byCreatedTimeReverse':	items.sort((a,b) => a.stat.ctime - b.stat.ctime);						break;
			}
			items.forEach( item => {																			// open the files
				if ( this.settings.excludedNames.some( name => { return RegExp(name,'m').test(item.name) } ) ) { return } // ignore excluded file names
					else
				if ( item instanceof obsidian.TFile && ( included_extensions.test(item.extension) || this.settings.extraFileTypes.includes(item.extension) ) ) {
					active_split = this_workspace.getLeaf();													// open new tab/leaf
					active_split.openFile(item);																// open file
					active_split.setPinned(true);																// pin new tab/leaf to prevent Obsidian reusing it to open next file in loop
				}
			});
			getAllLeaves().forEach( leaf => {
				if ( !pinned_tabs.includes(leaf.id) ) { leaf.setPinned(false); }								// unpin all tabs, except for originally pinned tabs
			});
			getActiveTabGroup().containerEl.dataset.sort_order = sort_order;
			toggleContinuousMode(this.app.appId +'_'+getActiveTabGroup().id,true)								// enable continuous mode
			this_workspace.setActiveLeaf(getActiveTabGroup().children[0]);										// set active leaf
		 }	
		 // Sort Items
		 const sortItems = async (tab_group_id,sort_order) => {
		 	let active_tab_group = getTabGroupByDataId(tab_group_id);
		 	let items = active_tab_group.children, sorted = [], pinned_tabs = [], active_split;
		 	if ( items === null ) { return }
			switch(sort_order) {																				// sort files
				case 'alphabetical':			sorted = items.toSorted((a,b) => a.view.file.name.localeCompare(b.view.file.name),navigator.language);	break;
				case 'alphabeticalReverse':		sorted = items.toSorted((a,b) => b.view.file.name.localeCompare(a.view.file.name),navigator.language);	break;
				case 'byModifiedTime':			sorted = items.toSorted((a,b) => b.view.file.stat.mtime - a.view.file.stat.mtime);						break;
				case 'byModifiedTimeReverse':	sorted = items.toSorted((a,b) => a.view.file.stat.mtime - b.view.file.stat.mtime);						break;
				case 'byCreatedTime':			sorted = items.toSorted((a,b) => b.view.file.stat.ctime - a.view.file.stat.ctime);						break;
				case 'byCreatedTimeReverse':	sorted = items.toSorted((a,b) => a.view.file.stat.ctime - b.view.file.stat.ctime);						break;
			}
			getAllLeaves().forEach( leaf => {																	// pin tabs to prevent tab reuse, i.e., coerce new tab creation
				if ( leaf.pinned === true ) { pinned_tabs.push(leaf.id) } else { leaf.setPinned(true) }			// make list of already pinned tabs or pin all unpinned tabs
			});
			this_workspace.setActiveLeaf(active_tab_group.children[0],{focus:true});
			active_tab_group.children.forEach( child => { 
				sleep(0).then( () => {
					child.setPinned(false);																		// unpin all leaves in tab group
					child.detach(); 																			// close all leaves in tab group
				}); 
			});																									// unpin & close all leaves in active tab group
			sorted.forEach( item => {																			// open the files
				active_split = this_workspace.getLeaf();														// open new tab/leaf
				active_split.openFile(item.view.file);															// open file
				active_split.setPinned(true);																	// pin new tab/leaf to prevent Obsidian reusing it to open next file in loop
			});
			getAllLeaves().forEach( leaf => {
				if ( !pinned_tabs.includes(leaf.id) ) { leaf.setPinned(false); }								// unpin all tabs, except for originally pinned tabs
			});
			active_tab_group.containerEl.dataset.sort_order = sort_order;
		 };
		// REGISTER EVENTS
		this.registerDomEvent(document,'click', function (e) {
			switch(true) {
				case !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode'):									return; 
				case ( /workspace-tab-header/.test(e.target.className) ):								scrollActiveLeafIntoView(false);		break;
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
					.setChecked( getTabGroupByDataId(tab_group_id).containerEl.classList.contains('is_continuous_mode') ? true : false )
					.onClick(async () => { 
						toggleContinuousMode(tab_group_id || this.app.appId+'_'+getActiveTabGroup().id);
					})
				})
				.addItem((item3) => {
					item3.setTitle( getTabGroupByDataId(tab_group_id).containerEl.classList.contains('hide_note_titles') ? 'Show note headers' : 'Hide note headers' )
					.setIcon('panelTopDashed')
					.setDisabled( getTabGroupByDataId(tab_group_id).containerEl.classList.contains('is_continuous_mode') ? false : true )
					.onClick(async () => { 
						getActiveTabGroup().containerEl.classList.toggle('hide_note_titles');
					})
				})
				.addItem((item4) => {
					item4.setTitle('Change sort order')
						.setIcon('arrow-up-narrow-wide')
						.setDisabled( getTabGroupByDataId(tab_group_id).children.length > 1 && getTabGroupByDataId(tab_group_id).containerEl.classList.contains('is_continuous_mode') ? false : true )
						.setSubmenu()
							.addItem((item5) => {
							item5.setTitle('File name (A to Z)')
								.setChecked( getTabGroupByDataId(tab_group_id).containerEl.dataset.sort_order === 'alphabetical' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'alphabetical');
								})
							})
							.addItem((item6) => {
								item6.setTitle('File name (Z to A)')
								.setChecked( getTabGroupByDataId(tab_group_id).containerEl.dataset.sort_order === 'alphabeticalReverse' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'alphabeticalReverse');
								})
							})
							.addSeparator()
							.addItem((item7) => {
								item7.setTitle('Modified time (new to old)')
								.setChecked( getTabGroupByDataId(tab_group_id).containerEl.dataset.sort_order === 'byModifiedTime' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byModifiedTime');
								})
							})
							.addItem((item8) => {
								item8.setTitle('Modified time (old to new)')
								.setChecked( getTabGroupByDataId(tab_group_id).containerEl.dataset.sort_order === 'byModifiedTimeReverse' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byModifiedTimeReverse');
								})
							})
							.addSeparator()
							.addItem((item9) => {
								item9.setTitle('Created time (new to old)')
								.setChecked( getTabGroupByDataId(tab_group_id).containerEl.dataset.sort_order === 'byCreatedTime' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byCreatedTime');
								})
							})
							.addItem((item10) => {
								item10.setTitle('Created time (old to new)')
								.setChecked( getTabGroupByDataId(tab_group_id).containerEl.dataset.sort_order === 'byCreatedTimeReverse' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byCreatedTimeReverse');
								})
							})
				})
		}
		const sort_menu = `
		<select class="dropdown"><option value="alphabetical">File name (A to Z)</option><option value="alphabeticalReverse">File name (Z to A)</option><option value="byModifiedTime">Modified time (new to old)</option><option value="byModifiedTimeReverse">Modified time (old to new)</option><option value="byCreatedTime">Created time (new to old)</option><option value="byCreatedTimeReverse">Created time (old to new)</option></select>`;
		const openItemsInContinuousModeMenuItems = (item,file,bool) => {	// bool === true => from search results menu
			let source = ( bool ? 'search results' : file instanceof obsidian.TFolder ? 'folder' : file instanceof obsidian.TFile ? 'file' : undefined );
			file = ( file instanceof obsidian.TFile ? [file] : file instanceof obsidian.TFolder ? file.children : file );
			item.setTitle('Continuous Mode')
				.setIcon('scroll-text')
				.setSection('open')
				.setSubmenu()
					.addItem((item2) => {
						item2.setTitle('Open '+source+' in new split left')
						.setIcon('panel-left-close')
						.onClick(async () => { 
							openFolderInContinuousMode(file,'open_left',bool);
						})
					})
					.addItem((item3) => {
						item3.setTitle('Open '+source+' in new split right')
						.setIcon('panel-right-close')
						.onClick(async () => { 
							openFolderInContinuousMode(file,'open_right',bool);
						})
					})
					.addItem((item4) => {
						item4.setTitle('Open '+source+' in new split down')
						.setIcon('panel-bottom-close')
						.onClick(async () => { 
							openFolderInContinuousMode(file,'open_down',bool);
						})
					})
					.addItem((item5) => {
						item5.setTitle('Open '+source+' in new split up')
						.setIcon('panel-top-close')
						.onClick(async () => { 
							openFolderInContinuousMode(file,'open_up',bool);
						})
					})
					.addSeparator()
					.addItem((item6) => {
						item6.setTitle('Open or append '+source+' in active tab group')
						.setIcon('appendFolder')
						.onClick(async () => { 
							openFolderInContinuousMode(file,'append',bool);
						})
					})
					.addItem((item7) => {
						item7.setTitle('Replace active tab group with '+source)
						.setIcon('replaceFolder')
						.onClick(async () => {
							if ( window.confirm('Warning: This will close all open notes in the active tab group. Are you sure you want to do this?') ) {
								openFolderInContinuousMode(file,'replace',bool) 
							}
						})
					})
		}
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu,file,source,leaf) => {
				switch(true) {
					case source === 'link-context-menu':
					case source === 'file-explorer-context-menu':
						menu.addItem((item) => { openItemsInContinuousModeMenuItems(item,file) });																break;
					default:
						menu.addItem((item) => { addContinuousModeMenuItem(item,leaf.containerEl.closest('.workspace-tabs').dataset.tab_group_id,leaf) });		break;
				}
			})
		)
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu,editor,leaf) => {
				menu.addItem((item) => { addContinuousModeMenuItem(item,editor.containerEl?.closest('.workspace-tabs').dataset.tab_group_id) });
			})
		);
		this.registerEvent(
			this.app.workspace.on('tab-group-menu', (menu,tab_group) => {
				menu.addItem((item) => { addContinuousModeMenuItem(item,tab_group.containerEl?.dataset.tab_group_id) });
			})
		);		
		this.registerEvent(
			this.app.workspace.on('search:results-menu', (menu,item,file) => {
				menu.addItem((item) => {
					let files = [], search_results = this.app.workspace.getLeavesOfType("search")[0].view.dom.resultDomLookup.values();
					for ( const value of search_results ) { files.push(value.file); };
					openItemsInContinuousModeMenuItems(item,files,true);
				})
			})
		);
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				updateTabGroupDatasetIds();
				setTimeout(() => {
					initContinuousMode();
					scrollActiveLeafIntoView(true);
				},250);
			})
		);
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				scrollActiveLeafIntoView(true);
			})
		)
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
			tab_group => { tab_group.classList.remove('is_continuous_mode','hide_note_titles'); delete tab_group.dataset.tab_group_id; delete tab_group.dataset.sort_order; }
		);
    }
	// load settings
    async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if ( this.settings.folderFileTypes.length === 0 ) { this.settings.folderFileTypes.push('markdown'); this.saveSettings(); }
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
			.addToggle( toggle => toggle.setValue(this.plugin.settings.folderFileTypes.includes('markdown') ? true : false)
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
				this.plugin.settings.extraFileTypes = [...new Set(value.split(','))].filter(Boolean);								// add unique file types, remove empty items
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Excluded files').setDesc('Exclude files by name (including extension). Comma-separated, case-sensitive, partial name and Regex allowed. (Note: If the file name contains a comma, use a period [wildcard character] here instead.) Extensions added here will override the settings in the above categories.').setClass("setting-indent")
			.addText((value) => value.setPlaceholder("e.g., “index.md”").setValue(this.plugin.settings.excludedNames.join(','))
			.onChange(async (value) => {
				this.plugin.settings.excludedNames = [...new Set(value.split(','))].filter(Boolean);									// add unique excluded names, remove empty items
				await this.plugin.saveSettings();
		}));
        this.containerEl.createEl("h2", { text: "Other" });
		new obsidian.Setting(containerEl).setName('Clear stored data').setDesc('Empty the list of stored tab groups, ignoring currently open tab groups with continuous mode active. This optional action prevents the list from getting unwieldy or cluttered with stale data, which can happen if you frequently open and close new tab groups.')
			.addButton((button) => {
				button.setButtonText('Clear');
				button.buttonEl.addEventListener("click", async () => {
					if ( window.confirm('Are you sure you want to clear all stored data?') ) {
						this.plugin.settings.tabGroupIds = [];																				// empty stored tabGroupIds
						this.app.workspace.rootSplit.children.forEach( child => { ( child.containerEl.classList.contains('is_continuous_mode') ? this.plugin.settings.tabGroupIds.push(this.app.appId +'_'+ child.id) : null ) }); 																												// add back currently active tabGroupIds
						await this.plugin.saveSettings();
					}
				})
		});
		new obsidian.Setting(containerEl).setName('Disable scroll active note into view').setDesc('If you find the plugin’s default scroll behavior on arrow navigation (which keeps the insertion point more or less centered by line/paragraph, similar to “typewriter mode”) distracting, enable this setting. Clicking tab headers will still scroll notes into view.')
			.addToggle( A => A.setValue(this.plugin.settings.disableScrollActiveLeafIntoView)
			.onChange(async (value) => {
				this.plugin.settings.disableScrollActiveLeafIntoView = value;
				await this.plugin.saveSettings();
		}));
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
