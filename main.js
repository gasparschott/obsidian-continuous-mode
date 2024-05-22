'use strict';

let obsidian = require('obsidian');

let DEFAULT_SETTINGS = {
	'includedFileTypes':['markdown'],
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
		const getTabGroupHeaders = () =>		{ return getActiveTabGroup().tabHeaderEls; }
		const getTabHeaderIndex = (e) =>		{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
		const getActiveLeaf = () =>				{ return getActiveTabGroup().workspace.getActiveViewOfType(obsidian.View).leaf; }
		const getActiveEditor = () =>			{ return this_workspace.activeEditor?.editor; }
		const updateTabGroupDatasetIds = obsidian.debounce( () => {
			getAllTabGroups().forEach( tab_group => { tab_group.containerEl.dataset.tab_group_id = this.app.appId +'_'+ tab_group.id });
		},25,true);
		updateTabGroupDatasetIds();
		const getDocumentLinks = (source,file,leaf) => {																								// get document links
			let document_links = (this.app.metadataCache.getFileCache(file).links)?.map( link => link?.link ) || [];									// get document links from metadata cache
			let document_embeds = (this.app.metadataCache.getFileCache(file)?.embeds)?.map( link => link?.link ) || [];									// get document embeds from metadata cache
			if ( this.settings.excludeEmbeddedFiles === false ) { document_links = document_links.concat(document_embeds); }							// concat doc links & embedded files
			let query_links, query_block_links = [];
			let query_blocks = leaf.view?.editor?.containerEl?.querySelectorAll('.block-language-dataview,.internal-query .search-result-container');	// get query block link elements
			for ( let i = 0; i < query_blocks.length; i++ ) {
				query_links = [];
				query_blocks[i].querySelectorAll('a')?.forEach( link => query_links.push(link.href) ) || query_blocks[i].querySelectorAll('.search-result-container .tree-item-inner span:nth-of-type(2)')?.forEach( query_result => query_links.push(query_result?.innerText) );
				query_block_links.push(query_links)
			}
			if ( this.settings.includeBlockLinks === true ) { document_links = document_links.concat(query_block_links).flat() };						// concat document & query block links
			document_links = document_links.map(link => obsidian.normalizePath(link.split('\/\/obsidian.md\/').reverse()[0].replace(/%20/g,' ')));		// clean up links
			return document_links;
		}
		const getFilesFromLinks = (document_links) => {																									// get files from links
			let files = [];
			document_links.forEach( link => {
				files.push(this.app.vault.getFileByPath(link) || this.app.metadataCache.getFirstLinkpathDest(link,''))
			})
			return files;
		}
		const icons = {
			appendFolder: `<svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-down" version="1.1" id="svg2" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"> <defs id="defs2" /> <rect width="18" height="18" x="3" y="3" rx="2" id="rect1" /> <path d="m 12,8 v 8" id="path1" /> <path d="m 8,12 4,4 4,-4" id="path2" /> <path d="M 15.999999,8 H 8" id="path1-2" /></svg>`,
			panelTopDashed: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-top-dashed"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M14 9h1"/><path d="M19 9h2"/><path d="M3 9h2"/><path d="M9 9h1"/></svg>`,
			replaceFolder: `<svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-down" version="1.1" id="svg2" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"> <defs id="defs2" /> <rect width="18" height="18" x="3" y="3" rx="2" id="rect1" /> <path d="m 8,14 4,4 4,-4" id="path2" /> <path d="m 8,9.9999586 4,-4 4,4" id="path2-3" /></svg>`,
			chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-chevron-down"><path d="m6 9 6 6 6-6"></path></svg>`
		} 
		const addIcons = () => {
		  Object.keys(icons).forEach((key) => {
			  (0, obsidian.addIcon)(key, icons[key]);
		  });
		};
		addIcons();
		/* ----------------------- */
		// TOGGLE CONTINUOUS MODE
		const toggleContinuousMode = (tab_group_id,bool) => {
			if ( this.app.appId === tab_group_id?.split('_')[0] ) {
				switch(true) {
					case getTabGroupByDataId(tab_group_id)?.containerEl?.classList.contains('is_continuous_mode') && bool !== true:	// if tab group is in continuous mode, remove continuous mode
						getActiveTabGroup().children.forEach(leaf => { 
							leaf.containerEl.querySelectorAll('.continuous_mode_open_links_button').forEach( btn => btn?.remove() );
							if ( !leaf.containerEl.classList.contains('mod-active') ) { leaf.containerEl.style.display = 'none'; } 
						});
						getTabGroupByDataId(tab_group_id)?.containerEl?.classList.remove('is_continuous_mode');						// remove style
						this.settings.tabGroupIds.splice(this.settings.tabGroupIds.indexOf(tab_group_id),1);						// remove tabGroupdId from data.json
						break;
					default:																										// if tab group is not in continuous mode (e.g., on app launch)
					let active_leaf_id = getActiveLeaf().id;
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
		const scrollActiveLeafIntoView = obsidian.debounce((bool) => {
			let active_leaf = getActiveLeaf(), active_editor = active_leaf.view.editor;
			if (!active_leaf || active_leaf.containerEl.closest('.is_continuous_mode') === null) { return }
			let view_type = active_leaf.view.getViewType(), offset_top = 0;
			switch(true) {
				case ( /pdf/.test(view_type) ):	offset_top = active_leaf?.containerEl.offsetTop;													break;
				default:						offset_top = active_leaf.containerEl.querySelector('.view-header').offsetTop;
					if ( bool === true && active_editor && active_editor.editorComponent.type === 'source' && this.settings.disableScrollActiveLeafIntoView === false ) {
						active_editor.scrollIntoView({from:active_editor.getCursor('from'),to:active_editor.getCursor('to')},true);	}										break;
			}
			if ( bool === false || !/markdown/.test(view_type) || (/markdown/.test(view_type) && this.settings.disableScrollActiveLeafIntoView === true) ) {
				active_editor?.focus()
				getActiveTabGroup().containerEl.querySelector('.workspace-tab-container').scrollTo(0,offset_top - 2);
			}
		},125,true);
		// ARROW NAVIGATION between open leaves
		const leafArrowNavigation = (e) => {
			switch(true) {																										// Ignore arrow navigation function in these cases:
				case ( /input|textarea/.test(document.activeElement.tagName.toLowerCase())):											// input or textarea
				case getActiveLeaf()?.containerEl?.closest('.mod-root') === null && !getActiveEditor()?.hasFocus():						// not in leaf editor or editor not focussed
				case e.target.querySelector('.canvas-node.is-focused') && /Arrow/.test(e.key): 											// editing canvas
				case e.target.querySelector('.workspace-leaf-content[data-set="graph"]') && /Arrow/.test(e.key) && e.shiftKey:	return;	// graph active; use shift key to move graph
			}
			let cursorAnchor = getActiveEditor()?.getCursor('anchor');
			let active_leaf = getActiveLeaf(), activeTabGroupChildren = getActiveTabGroup().children;
			switch(e.key) {
				case 'ArrowUp': case 'ArrowLeft':
					switch(true) {
						case ( /html/.test(active_leaf.view.getViewType()) && e.key === 'ArrowLeft' ): 
								active_leaf.containerEl.querySelector('iframe').focus();
								active_leaf.containerEl.querySelector('iframe').contentWindow.scrollBy({top:-250,left:0,behavior:'smooth'});			
								break;
						case cursorAnchor?.line === 0 && cursorAnchor?.ch > 0 && e.key === 'ArrowUp':	getActiveEditor()?.setCursor({line:0,ch:0});	break;	// set cursor to beginning of editor
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowLeft' ):	pdfPageNavigation(e);							break;	// pdf page navigation
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowUp' ):
								active_leaf.view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
						 		active_leaf.view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');			// nobreak
						case e.target.classList.contains('inline-title') && window.getSelection().anchorOffset === 0:									// nobreak; cursor in inline-title
						case e.target.classList.contains('metadata-properties-heading'):																// nobreak; cursor in properties header
						case active_leaf.getViewState().state.mode === 'preview':																		// nobreak; leaf is in preview mode
						case cursorAnchor?.line === 0 && cursorAnchor?.ch === 0:																		// nobreak; cursor at first line, first char
						case (!/markdown/.test(active_leaf.getViewState().type)):																		// nobreak; leaf is empty (new tab)
							if ( active_leaf.containerEl.previousSibling !== null ) {																	// ignore if first leaf
								this_workspace.setActiveLeaf(activeTabGroupChildren[activeTabGroupChildren.indexOf(active_leaf) - 1],{focus:true});		// make previous leaf active 
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
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowRight' ):	pdfPageNavigation(e);							break;
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowDown' ):
								active_leaf.view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
						 		active_leaf.view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');			// nobreak
						case ( cursorAnchor?.ch === getActiveEditor()?.getLine(getActiveEditor().lastLine()).length && cursorAnchor?.line === getActiveEditor()?.lineCount() - 1 ):
						case active_leaf.getViewState().state.mode === 'preview':																		// leaf is in preview mode
						case (!/markdown/.test(active_leaf.getViewState().type)):																		// make next leaf active
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
			let activeTabGroupChildren = getActiveTabGroup.children;
			let scroll_top = 0;
			switch(true) {
				case ( e.key === 'ArrowRight' ):
					switch(true) {
						case focused_pdf_page === null:					 pdf_pages[0].div.classList.add('focused_pdf_page'); 					break;	// add class to first page
						case focused_pdf_page.nextSibling !== null: 	 focused_pdf_page.nextSibling.classList.add('focused_pdf_page');				// add class to next page
																		 focused_pdf_page.classList.remove('focused_pdf_page');					break;	// remove class from previous page
						case focused_pdf_page.nextSibling === null:		 focused_pdf_page.classList.remove('focused_pdf_page');							// remove class from last page
							 this_workspace.setActiveLeaf((activeTabGroupChildren?.[activeTabGroupChildren?.indexOf(getActiveLeaf()) + 1] || getActiveLeaf()),{focus:true});	// focus next leaf
																																				break;
					}																															break;
				case ( e.key === 'ArrowLeft' ):
					switch(true) {
						case focused_pdf_page === null:					 pdf_pages[pdf_pages.length - 1].div.classList.add('focused_pdf_page');	break;	// add class to last page
						case focused_pdf_page.previousSibling !== null:	 focused_pdf_page.previousSibling.classList.add('focused_pdf_page');			// add class to previous page
																		 focused_pdf_page.classList.remove('focused_pdf_page');					break;	// remove class from last page
						case focused_pdf_page.previousSibling === null:	 focused_pdf_page.classList.remove('focused_pdf_page');							// remove class from first page
							 this_workspace.setActiveLeaf((activeTabGroupChildren?.[activeTabGroupChildren?.indexOf(getActiveLeaf()) - 1] || getActiveLeaf()),{focus:true});	// focus previous leaf
																																				break;
					}																															break;
			}
			scroll_top = (getActiveLeaf().view.viewer?.containerEl?.querySelector('.focused_pdf_page')?.offsetTop || 0) + getActiveLeaf().containerEl?.querySelector('.pdf-toolbar').offsetHeight;
			getActiveLeaf().containerEl?.querySelector('.pdf-container').scrollTo({left:0,top:scroll_top,behavior:'smooth'});
			getActiveLeaf().view.viewer?.containerEl?.querySelector('.pdf-toobar')?.click();	// needed to focus pdf viewer and enable proper page navigation by arrow keys
		}
		// OPEN ITEMS IN CONTINUOUS MODE
		const openItemsInContinuousMode = (items,action,type) => {
			// temp: replace settings.folderFileTypes with settings.includedFileTypes; remove after next update
			if ( this.settings.folderFileTypes !== undefined ) { this.settings.includedFileTypes = this.settings.folderFileTypes; delete this.settings['folderFileTypes']; this.saveSettings(); }

			let active_split, new_split, pinned_tabs = [];
			let open_files = [], included_extensions = [];
			let maximumItemsToOpen = ( this.settings.maximumItemsToOpen < 1 || this.settings.maximumItemsToOpen === undefined ? Infinity : this.settings.maximumItemsToOpen );
			this.app.workspace.getMostRecentLeaf().parent.children.forEach( child => open_files.push(child.view.file) );							// get open files
			let extensions = { 
				markdown:	['md'],
				images:		['avif','bmp','jpg','jpeg','gif','^png','svg','webp'],
				canvas:		['canvas'],
				media:		['aac','aif','aiff','ape','flac','m4a','mka','mp3','ogg','opus','wav','m4v','mkv','mov','mp4','mpeg','webm'],
				pdf:		['pdf'],
				extra:		this.settings.extraFileTypes
			};
			for (const [key, value] of Object.entries(extensions)) { if ( this.settings.includedFileTypes.includes(key) ) { included_extensions.push(value); } }	// get included extensions
			// filter items
			items = items.filter( item => item instanceof obsidian.TFile );																			// item must be obsidian.TFile
			items = items.filter( item => included_extensions.flat().includes( item.extension ));													// remove excluded items by extension
			items = items.filter( item => !this.settings.excludedNames.includes( item.basename +'.'+ item.extension ));								// remove excluded items by name
			// warnings
			switch(true) {
				case items.length > 99 && !window.confirm('You are about to open '+ items.length +'. Are you sure you want to do this?'): return;	// warn on opening > 99 notes
				case items.length === 0:  		return alert(type === 'document links' ? 'No document links found.' : 'No readable files found.');
			}
			// pin currently open tabs to prevent tab reuse, i.e., coerce new tab creation for each item
			getAllLeaves().forEach( leaf => { if ( leaf.pinned === true ) { pinned_tabs.push(leaf.id) } else { leaf.setPinned(true) } });
			switch(true) {
				case action === 'append':																		// append items to active tab group
					this_workspace.setActiveLeaf(this_workspace.getMostRecentLeaf(),{focus:true});				// set most recent leaf to active
					if ( getActiveLeaf().parent.children.length === 1 && getActiveLeaf().getViewState().type === 'empty' ) { getActiveLeaf().setPinned(false); } 	// unpin single active empty leaf
					items = items.filter( item => !open_files.includes(item) );									// filter already open files (this filter only needed here)
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
			// sort items
			let sort_order = ( type ===  undefined ? 'alphabetical' : /search/.test(type) ? this.app.workspace.getLeavesOfType('search')[0].view.dom.sortOrder : this.app.workspace.getLeavesOfType('file-explorer')[0].view.sortOrder );
			switch(sort_order) {
				case 'alphabetical':			items.sort((a,b) => a?.name.localeCompare(b?.name),navigator.language);	break;
				case 'alphabeticalReverse':		items.sort((a,b) => b?.name.localeCompare(a?.name),navigator.language);	break;
				case 'byModifiedTime':			items.sort((a,b) => b?.stat.mtime - a?.stat.mtime);						break;
				case 'byModifiedTimeReverse':	items.sort((a,b) => a?.stat.mtime - b?.stat.mtime);						break;
				case 'byCreatedTime':			items.sort((a,b) => b?.stat.ctime - a?.stat.ctime);						break;
				case 'byCreatedTimeReverse':	items.sort((a,b) => a?.stat.ctime - b?.stat.ctime);						break;
			}
			// open sorted items
			for ( let i = 0; i < maximumItemsToOpen && i < items.length; i++ ) {								// limit number of items to open
				active_split = this_workspace.getLeaf();														// open new tab/leaf
				active_split.openFile(items[i]);																// open file
				active_split.setPinned(true);																	// pin each new tab/leaf to prevent Obsidian reusing it to open next file in loop
			}
			// unpin tabs
			getAllLeaves().forEach( leaf => { if ( !pinned_tabs.includes(leaf.id) ) { leaf.setPinned(false); } });
			getActiveTabGroup().containerEl.dataset.sort_order = sort_order;									// set data-sort_order
			toggleContinuousMode(this.app.appId +'_'+getActiveTabGroup().id,true)								// enable continuous mode
			this_workspace.setActiveLeaf(getActiveTabGroup().children[0]);										// set active leaf
		 }
		 // end openItemsInContinuousMode	
		 // Sort Items
		 const sortItems = async (tab_group_id,sort_order) => {
		 	let active_tab_group = getTabGroupByDataId(tab_group_id);
		 	let items = active_tab_group.children, sorted = [], pinned_tabs = [], active_split;
		 	if ( items === null ) { return }
			switch(sort_order) {																				// sort files
				case 'alphabetical':			sorted = items.toSorted((a,b) => a?.view.file.name.localeCompare(b?.view.file.name),navigator.language);	break;
				case 'alphabeticalReverse':		sorted = items.toSorted((a,b) => b?.view.file.name.localeCompare(a?.view.file.name),navigator.language);	break;
				case 'byModifiedTime':			sorted = items.toSorted((a,b) => b?.view.file.stat.mtime - a?.view.file.stat.mtime);						break;
				case 'byModifiedTimeReverse':	sorted = items.toSorted((a,b) => a?.view.file.stat.mtime - b?.view.file.stat.mtime);						break;
				case 'byCreatedTime':			sorted = items.toSorted((a,b) => b?.view.file.stat.ctime - a?.view.file.stat.ctime);						break;
				case 'byCreatedTimeReverse':	sorted = items.toSorted((a,b) => a?.view.file.stat.ctime - b?.view.file.stat.ctime);						break;
			}
			getAllLeaves().forEach( leaf => { if ( leaf.pinned === true ) { pinned_tabs.push(leaf.id) } else { leaf.setPinned(true) } });	// pin all currently open tabs; remember currently pinned
			this_workspace.setActiveLeaf(active_tab_group.children[0],{focus:true});
			active_tab_group.children.forEach( child => { 
				sleep(0).then( () => {
					child.setPinned(false);																			// unpin all leaves in active tab group
					child.detach(); 																				// close all leaves in active tab group
				}); 
			});																										// unpin & close all leaves in active tab group
			sorted.forEach( item => {																				// open the files
				active_split = this_workspace.getLeaf();															// open new tab/leaf
				active_split.openFile(item.view.file);																// open file
				active_split.setPinned(true);																		// pin new tab/leaf to prevent Obsidian reusing it to open next file in loop
			});
			getAllLeaves().forEach( leaf => { if ( !pinned_tabs.includes(leaf.id) ) { leaf.setPinned(false); } });	// unpin all tabs, except for originally pinned tabs
			active_tab_group.containerEl.dataset.sort_order = sort_order;											// set data-sort_order
		 };
		// REGISTER EVENTS
		this.registerDomEvent(window,'click', function (e) {
			switch(true) {
				case (/nav-folder/.test(e.target.classList) && this.app.plugins.plugins['continuous-mode'].settings.allowSingleClickOpenFolder === true ):		// open folders on single click
					let path = e.target.closest('.nav-folder-title').dataset.path, files = this.app.vault.getFolderByPath(e.target.closest('.nav-folder-title').dataset.path).children;
					let action = (this.app.plugins.plugins['continuous-mode'].settings.allowSingleClickOpenFolderAction || 'open_left');
						openItemsInContinuousMode(files,action,'folder');																				break;
				case e.target.classList.contains('continuous_mode_open_links_button'):
				case e.target.closest('.continuous_mode_open_links_button') !== null:					openLinksMenu(e);								break;	// open links in continuous mode
				case !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode'):													return;	// do nothing if not in continuous mode
				case ( /workspace-tab-header/.test(e.target.className) ):								scrollActiveLeafIntoView(false);				break;
			}
		});
		this.registerDomEvent(window,'mouseover',function (e) {
			let continuous_mode_open_links_button, button_container_el;
			switch(true) {
				case e.target.closest('.markdown-reading-view,.markdown-preview-view') !== null:				// show button in reading view
					switch(true) {
						case e.target.closest('.block-language-dataview') !== null:
								button_container_el = e.target.closest('.block-language-dataview');
							break;
						case e.target.closest('.internal-query') !== null:
								button_container_el = e.target.closest('.internal-query')?.querySelector('.internal-query-header');
							break;
					}
					break;
				case e.target.closest('.markdown-source-view') !== null:										// show button in edit view
					switch(true) {
						case e.target.closest('.cm-preview-code-block')?.querySelector('.internal-query-header') !== null:
								button_container_el = e.target.closest('.cm-preview-code-block')?.querySelector('.internal-query-header');
							break;
						case e.target.closest('.cm-preview-code-block')?.querySelector('.internal-query-header') === null:
								button_container_el = e.target.closest('.cm-preview-code-block');
							break;
					}
					break;
				}
				if ( button_container_el?.querySelector('.continuous_mode_open_links_button') === null ) {		// add open links button if not there already
					continuous_mode_open_links_button = button_container_el?.createEl('div',{cls:'continuous_mode_open_links_button clickable-icon'});
					continuous_mode_open_links_button.setAttribute('aria-label','Continuous Mode');
					continuous_mode_open_links_button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>';
				}
		});
		this.registerDomEvent(window,'keydown', function (e) {
			if ( e.target.tagName.toLowerCase() === 'body' )									 							{ return; }	// do nothing if tab group is not active
			if ( !getActiveLeaf().containerEl.closest('.workspace-tabs')?.classList.contains('is_continuous_mode') )		{ return; }	// do nothing if continuous mode is not active in tab group
			if ( /Arrow/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ) { leafArrowNavigation(e); }				// else arrow navigation			
		});	
		this.registerDomEvent(window,'dragstart',function(e) { 
			if ( !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode')) { return; }
			if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }					// get initial tab header index for onTabHeaderDragEnd()
		});
		// ADD CONTEXTUAL MENU ITEMS
		const addContinuousModeMenuItem = (item, tab_group_id, leaf) => {														// add continuous mode menu items (toggle, headers, sort)
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
			.addSeparator();
		}
		const openItemsInContinuousModeMenuItems = (item,file,type) => {																			// open items in continuous mode menu items
			type = ( type !== undefined ? type : file instanceof obsidian.TFolder ? 'folder' : file instanceof obsidian.TFile ? 'file' : null );
			file = ( file instanceof obsidian.TFile ? [file] : file instanceof obsidian.TFolder ? file.children : file );
			item.setTitle('Continuous Mode')
				.setIcon('scroll-text')
				.setSection( type === 'document links' ? 'pane' : 'open')
				.setSubmenu()
					.addItem((item2) => {
						item2.setTitle('Open '+type+' in new split left')
						.setIcon('panel-left-close')
						.onClick(async () => { openItemsInContinuousMode(file,'open_left',type); })
					})
					.addItem((item3) => {
						item3.setTitle('Open '+type+' in new split right')
						.setIcon('panel-right-close')
						.onClick(async () => { openItemsInContinuousMode(file,'open_right',type); })
					})
					.addItem((item4) => {
						item4.setTitle('Open '+type+' in new split down')
						.setIcon('panel-bottom-close')
						.onClick(async () => { openItemsInContinuousMode(file,'open_down',type); })
					})
					.addItem((item5) => {
						item5.setTitle('Open '+type+' in new split up')
						.setIcon('panel-top-close')
						.onClick(async () => { openItemsInContinuousMode(file,'open_up',type); })
					})
					.addSeparator()
					.addItem((item6) => {
						item6.setTitle('Open or append '+type+' in active tab group')
						.setIcon('appendFolder')
						.onClick(async () => { openItemsInContinuousMode(file,'append',type); })
					})
					.addItem((item7) => {
						item7.setTitle('Replace active tab group with '+type)
						.setIcon('replaceFolder')
						.onClick(async () => {
							if ( window.confirm('Warning: This will close all open notes in the active tab group. Are you sure you want to do this?') ) {
								openItemsInContinuousMode(file,'replace',type) 
							}
						})
					})
		}
		// CONTEXT MENU EVENTS
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu,editor/*,info*/) => {																			// on editor-menu
				menu.addItem((item) => { 
					let links = getDocumentLinks('document links',editor.editorComponent.view.file,editor.editorComponent.view.leaf), files = getFilesFromLinks(links);
					addContinuousModeMenuItem(item,editor?.containerEl?.closest('.workspace-tabs').dataset.tab_group_id);
					openItemsInContinuousModeMenuItems(item,files,'document links');																	// add open document links items
				});
			})
		);
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu,file,source,leaf) => {																				// on file-menu
				switch(true) {
					case (/link-context-menu|file-explorer-context-menu/.test(source)):																	// link context menu/file-explorer menu
						menu.addItem((item) => { openItemsInContinuousModeMenuItems(item,file) });												break;
					default:
						menu.addItem((item) => {																										// file menu
							let links = getDocumentLinks('document links',file,leaf), files = getFilesFromLinks(links);
							addContinuousModeMenuItem(item,leaf?.containerEl?.closest('.workspace-tabs').dataset.tab_group_id, leaf, links)
							openItemsInContinuousModeMenuItems(item,files,'document links');															// add open document links items
						});																														break;
				}
			})
		)
		this.registerEvent(
			this.app.workspace.on('files-menu', (menu,files,source) => {																				// on files-menu
				switch(true) {
					case (/link-context-menu|file-explorer-context-menu/.test(source)):																	// open selected files in CM
						menu.addItem((item) => { openItemsInContinuousModeMenuItems(item,files,'selected files') });							break;
				}
			})
		)
		this.registerEvent(
			this.app.workspace.on('tab-group-menu', (menu,tab_group) => {																				// on tab-group-menu
				menu.addItem((item) => { addContinuousModeMenuItem(item,tab_group.containerEl?.dataset.tab_group_id) });
			})
		);
		this.registerEvent(
			this.app.workspace.on('search:results-menu', (menu,item) => {																				// on search-results-menu
				menu.addItem((item) => {
					let files = [], search_results = this.app.workspace.getLeavesOfType("search")[0].view.dom.resultDomLookup.values();
					for ( const value of search_results ) { files.push(value.file); };
					openItemsInContinuousModeMenuItems(item,files,'search results');
				})
			})
		);
		const openLinksMenu = (e) => {
			const open_links_menu = new obsidian.Menu(); let links, file, files = [];
			switch(true) {
				case e.target.closest('.cm-preview-code-block') !== null:																				// editing view
					links = e.target.closest('.cm-preview-code-block')?.querySelectorAll('a.internal-link,.search-result .tree-item-inner');	break;
				case e.target.closest('.internal-query') !== null:																						// reading-view
					links = e.target.closest('.internal-query')?.querySelectorAll('.search-result .tree-item-inner');							break;
				case e.target.closest('.block-language-dataview') !== null:																				// reading-view
					links = e.target.closest('.block-language-dataview')?.querySelectorAll('a.internal-link');									break;
			}
			links = Array.from(links).map( link => link.dataset?.href || link.innerText );																// get links
			files = getFilesFromLinks(links);																											// get files
			open_links_menu.setUseNativeMenu(false);
			open_links_menu.addItem(
				item => openItemsInContinuousModeMenuItems(item,files,'query block links')
			)
			open_links_menu.showAtMouseEvent(e);
		}
		// OTHER EVENTS
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
		let nodes = (this.app.workspace.floatingSplit?.children || []).concat(this.app.workspace.rootSplit?.children || []);
		nodes.forEach(
			node => { 
				node.containerEl.querySelectorAll('.is_continuous_mode,.hide_note_titles').forEach( 
					el => {
						el?.classList?.remove('is_continuous_mode','hide_note_titles'); delete el?.dataset?.tab_group_id; delete el?.dataset?.sort_order; 
						el?.querySelectorAll('.continuous_mode_open_links_button').forEach(btn => btn?.remove() );
					}
				)
			}
		);

    }
	// load settings
    async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if ( this.settings.includedFileTypes.length === 0 ) { this.settings.includedFileTypes.push('markdown'); this.saveSettings(); }
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
        this.containerEl.createEl("h2", { text: '“Open in Continuous Mode” menus: filter included file types and items' })
		this.containerEl.createEl('p', { text: 'Select file types and items to include when using the various “Open in Continuous Mode” contextual menu items. (Note: toggling off these settings does not prevent any of these file types from being opened manually.)'});
		new obsidian.Setting(containerEl).setName('Include markdown').setDesc('Default.').setClass("setting-indent")
			.addToggle( toggle => toggle.setValue(this.plugin.settings.includedFileTypes.includes('markdown') ? true : false)
			.onChange(async (value) => {
				(value === true || this.plugin.settings.includedFileTypes.length === 0 ? this.plugin.settings.includedFileTypes.push('markdown') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('markdown'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include images').setDesc('Natively supported file types: avif, bmp, gif, jpg, png, svg, webp.').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includedFileTypes.includes('images'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.includedFileTypes.push('images') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('images'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include canvas files').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includedFileTypes.includes('canvas'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.includedFileTypes.push('canvas') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('canvas'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include media').setDesc('Natively supported file types: aac, aif, aiff, ape, flac, m4a, mka, mp3, ogg, opus, wav, m4v, mkv, mov, mp4, mpeg, webm.').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includedFileTypes.includes('media'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.includedFileTypes.push('media') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('media'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include pdfs').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includedFileTypes.includes('pdf'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.includedFileTypes.push('pdf') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('pdf'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include other file extensions').setDesc('If you have installed plugins that allow Obsidian to support file types or extensions not included above, add the file extensions here, comma-separated.').setClass("setting-indent")
			.addText((value) => value.setPlaceholder("e.g. html, js, py, etc.").setValue(this.plugin.settings.extraFileTypes.join(','))
			.onChange(async (value) => {
				this.plugin.settings.extraFileTypes = [...new Set(value.split(','))].filter(Boolean);								// add unique file types, remove empty items
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Excluded files').setDesc('Exclude files by name and/or extension. Comma-separated, case-sensitive, partial name and Regex allowed. (Note: If the file name contains commas, use periods [wildcard character] instead.) Extensions added here will override the settings in the above categories.').setClass("setting-indent")
			.addText((value) => value.setPlaceholder("e.g., “index.md”").setValue(this.plugin.settings.excludedNames.join(','))
			.onChange(async (value) => {
				this.plugin.settings.excludedNames = [...new Set(value.split(','))].filter(Boolean);									// add unique excluded names, remove empty items
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Exclude embedded files').setDesc('If true, ignore embedded files when opening all document links in Continuous Mode.').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.excludeEmbeddedFiles)
			.onChange(async (value) => {
				this.plugin.settings.excludeEmbeddedFiles = value;
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include all Dataview and Query block links').setDesc('If true, include links in Dataview and Query blocks when opening all document links in Continuous Mode. Links from individual blocks can still be opened directly from the block menu.').setClass("setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includeBlockLinks)
			.onChange(async (value) => {
				this.plugin.settings.includeBlockLinks = value;
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Maximum number of items to open at one time').setDesc('Leave empty (or set to 0) to open all items at once. Otherwise, setting a value here allows you to incrementally open the items in a folder (or search results or document links) by repeatedly selecting “Open or append items in Continuous Mode.” Useful for dealing with folders containing a large number of items.')
			.addText((A) => A.setPlaceholder("").setValue(this.plugin.settings.maximumItemsToOpen.toString())
			.onChange(async (value) => {
				if ( isNaN(Number(value)) || !Number.isInteger(Number(value)) ) { 
					alert('Please enter a positive integer, 0, or leave blank.');
					A.setValue('');
				} else {
					this.plugin.settings.maximumItemsToOpen = Number(value.trim()) || 0;									// add unique excluded names, remove empty items
					await this.plugin.saveSettings();
				}
		}));
        new obsidian.Setting(containerEl).setName('Allow single click to open File Explorer folders in Continuous Mode').setDesc('Enable this setting to make it possible to open all items in a File Explorer folder with a single click. Set the default single click action below.')
        	.addToggle( A => A.setValue(this.plugin.settings.allowSingleClickOpenFolder)
        	.onChange(async (value) => {
        		this.plugin.settings.allowSingleClickOpenFolder = value;
        		await this.plugin.saveSettings();
        }));
		new obsidian.Setting(containerEl).setName('Set default single-click action:').setClass("setting-indent")
			.addDropdown((dropDown) => {
				dropDown.addOption("open_left", "Open folder in new split left");
				dropDown.addOption("open_right", "Open folder in new split right");
				dropDown.addOption("open_down", "Open folder in new split down");
				dropDown.addOption("open_up", "Open folder in new split up");
				dropDown.addOption("append", "Open or append folder in active tab group");
				dropDown.addOption("replace", "Replace active tab group with folder");
				dropDown.setValue( this.plugin.settings.allowSingleClickOpenFolderAction )
				dropDown.onChange(async (value) => {
					this.plugin.settings.allowSingleClickOpenFolderAction = value;
					await this.plugin.saveSettings();
		  });
		});
        this.containerEl.createEl("h2", { text: "Other" });
		new obsidian.Setting(containerEl).setName('Disable scroll active note into view').setDesc('If you find the plugin’s default scroll behavior on arrow navigation (which keeps the insertion point more or less centered by line/paragraph, similar to “typewriter mode”) distracting, enable this setting. Clicking tab headers will still scroll notes into view.')
			.addToggle( A => A.setValue(this.plugin.settings.disableScrollActiveLeafIntoView)
			.onChange(async (value) => {
				this.plugin.settings.disableScrollActiveLeafIntoView = value;
				await this.plugin.saveSettings();
		}));
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
