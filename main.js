'use strict';

let obsidian = require('obsidian');

let DEFAULT_SETTINGS = {
	'includedFileTypes':['markdown'],
	'extraFileTypes':[],
	'excludedNames':[],
	'tabGroupIds': [],
	'disableScrollRootItemsIntoView': false
};
class ContinuousModePlugin extends obsidian.Plugin {
    async onload() {
		console.log('Loading the Continuous Mode plugin.');
		await this.loadSettings();
		this.addSettingTab(new ContinuousModeSettings(this.app, this));
		/* ----------------------- */
		// HELPERS
		const workspace = this.app.workspace; 
		const getAllTabGroups = () => {
			let root_children = workspace.rootSplit?.children || [], 
				left_children = workspace.leftSplit?.children || [], 
				right_children = workspace.rightSplit?.children || [], 
				floating_children = workspace.floatingSplit?.children || [];
			let nodes = (floating_children).concat(root_children,right_children,left_children);
			if ( nodes[0] === undefined ) { return []; }
			let all_tab_groups = [];
			nodes.forEach( node => { if ( node && node?.type === 'tabs' ) { all_tab_groups.push(node) } else { all_tab_groups = getTabGroupsRecursively(node,all_tab_groups) } });
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
		const getTabGroupById = (id) =>			{ return getAllTabGroups()?.find( tab_group => tab_group.id === id ); }			// get tab group by id, not dataset-tab-group-id
		const getTabHeaderIndex = (e) =>		{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
		const getActiveLeaf = () =>				{ return workspace.activeTabGroup.children?.find( child => child.tabHeaderEl.className.includes('active')) ?? workspace.activeTabGroup.children?.[0]; }
		const getActiveEditor = () =>			{ return workspace.activeEditor?.editor; }
		const updateTabGroupDatasetIds = obsidian.debounce( () => {
			getAllTabGroups().forEach( tab_group => { tab_group.containerEl.dataset.tab_group_id = this.app.appId +'_'+ tab_group.id });
		},25,true);
		const getDocumentLinks = (file,leaf) => {																										// get document links
			let document_links = (this.app.metadataCache.getFileCache(file).links)?.map( link => link?.link ) || [];									// get document links from metadata cache
			let document_embeds = (this.app.metadataCache.getFileCache(file)?.embeds)?.map( link => link?.link ) || [];									// get document embeds from metadata cache
			if ( this.settings.excludeEmbeddedFiles === true ) { document_links = document_links.concat(document_embeds); }								// concat doc links & embedded files
			let query_links, query_block_links = [];
			let query_blocks = leaf.view?.editor?.containerEl?.querySelectorAll('.block-language-folder-overview,.block-language-dataview,.internal-query .search-result-container'); // query blocks
			for ( let i = 0; i < query_blocks?.length; i++ ) {
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
		const getFilesFromSearchResults = () => {
			let items = [];
			workspace.getLeavesOfType('search')[0].view.dom.vChildren._children.forEach( item => items.push(item.file) )
			return items
		}
		const isVisible = (el) => {																														// determine if a scrollable el is visible
		    const rect = el.getBoundingClientRect();
			return ( rect.top >= el.offsetHeight && rect.bottom <= (window.innerHeight - el.offsetHeight || document.documentElement.clientHeight - el.offsetHeight) );
		}
		// ICONS
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
		/* ----------------------- */
		// TOGGLE CONTINUOUS MODE
		const toggleContinuousMode = (tab_group_id,bool) => {
			if ( this.app.appId === tab_group_id?.split('_')[0] ) {
				let id = tab_group_id?.split('_')[1];
				switch(true) {
					case getTabGroupById(id)?.containerEl?.classList?.contains('is_continuous_mode') && bool !== true:				// remove continuous mode
						workspace.activeTabGroup.children.forEach(leaf => { 
							leaf.containerEl.querySelectorAll('.continuous_mode_open_links_button').forEach( btn => btn?.remove() );
							if ( !leaf.containerEl.classList.contains('mod-active') ) { leaf.containerEl.style.display = 'none'; } 
						});
						getTabGroupById(id)?.containerEl?.classList?.remove('is_continuous_mode');									// remove style
						this.settings.tabGroupIds.splice(this.settings.tabGroupIds.indexOf(tab_group_id),1);						// remove tabGroupdId from data.json
						break;
					default:																										// add continuous mode (e.g., on app launch)
						getTabGroupById(id)?.containerEl?.classList?.add('is_continuous_mode');										// add style
						if ( !this.settings.tabGroupIds.includes(tab_group_id) ) { this.settings.tabGroupIds.push(tab_group_id); }	// add tabGroupdId to data.json if it is not already there
				}
				this.settings.tabGroupIds = [...new Set(this.settings.tabGroupIds)];												// remove dupe IDs if necessary
				this.settings.tabGroupIds.sort();																					// sort the tabGroupIds
				this.saveSettings();																								// save the settings
			}
		}
		// INITIALIZE CONTINUOUS MODE = add continuous mode class to workspace tab groups from plugin settings
		const initContinuousMode = () => {
			addIcons();
			updateTabGroupDatasetIds();
			if ( this.settings.tabGroupIds ) {																						// if there are any saved tabGroupIds...
				this.settings.tabGroupIds.forEach( tab_group_id => {																// for each id...
					if ( this.app.appId === tab_group_id.split('_')[0] ) {															// if the tabgroup belongs to the current app (window)...
 						toggleContinuousMode(tab_group_id,true);																	// toggle continuous mode
					}
				});
			}
		}
		sleep(500).then( () => { initContinuousMode() });																			// initialize CM on plugin load
		/*-----------------------------------------------*/
		// DRAG TAB HEADERS to Rearrange Leaves on dragstart
		const onTabHeaderDragEnd = (e,initial_tab_header_index) => {
			e.target.ondragend = function(f) { 
				if ( getTabHeaderIndex(f) !== initial_tab_header_index ) { rearrangeLeaves(f,initial_tab_header_index); }	// only rearrange leaves if tab header is actually moved to a new position
			}
		}
		// REARRANGE LEAVES on dragend
		const rearrangeLeaves = (e,initial_tab_header_index) => {
			let leaves_container = e.target.closest('.workspace-tabs').querySelector('.workspace-tab-container');						// get current tab container
			let leaves = Array.from(leaves_container.children);																			// get current tab container leaves
			let final_tab_header_index = getTabHeaderIndex(e);																			// get final dropped tab header index
			let moved = leaves.splice(initial_tab_header_index,1);																		// get the moved leave
			let rearranged = leaves.toSpliced(final_tab_header_index,0,moved[0]);														// move the moved leaf into position
			leaves_container.setChildrenInPlace(rearranged);																			// replace tab container content with rearranged leaves
			workspace.activeTabGroup.tabHeaderEls[final_tab_header_index].click();														// confirm drag and focus leaf by clicking tab
		}
		// SCROLL ACTIVE ITEMS INTO VIEW
		const scrollRootItems = (target) => {
			if ( this.settings.disableScrollRootItemsIntoView === true ) { return }
			let workspaceTabs = target.closest('.workspace-tabs');
			let activeLeaf = workspaceTabs.querySelector('.workspace-leaf.mod-active');
			let workspaceTabsHeader = workspaceTabs.querySelector('.workspace-tab-header-container');
			workspaceTabs.querySelector('.workspace-tab-container').scrollTo({top:activeLeaf.offsetTop - workspaceTabsHeader.offsetHeight,behavior:'smooth'}); 	// scroll leaf into view
			scrollTabHeader(); 																									// scroll tab into view
		}
		const scrollTabHeader = () => {
			if ( this.settings.disableScrollRootItemsIntoView === true ) { return }
			let tabsContainer = workspace.activeTabGroup.tabHeaderContainerEl.querySelector('.workspace-tab-header-container-inner');
			tabsContainer.scrollTo({left:(getActiveLeaf().tabHeaderEl.offsetLeft - getActiveLeaf().tabHeaderEl.offsetWidth),behavior:'smooth'});
		}
		const scrollToActiveLine = (e,el) => {
			if ( this.settings.disableScrollRootItemsIntoView === true ) { return }
			let offset = 0;
			switch(true) {
				case ( /metadata-/.test(el?.className) ):																			// scroll metadata/properties
				case ( /metadata-/.test(e.target.className) ):																			// scroll metadata/properties
					getActiveEditor().containerEl.querySelector('.cm-active')?.classList.remove('cm-active');							// deselect editor active line
					switch(true) {
						case el !== undefined:
							el?.focus();
							workspace.activeTabGroup.tabsContainerEl.scrollTo(
								{top:getActiveLeaf().containerEl.offsetTop - workspace.activeTabGroup.tabHeaderContainerEl.offsetHeight 
								- getActiveLeaf().containerEl.querySelector('.metadata-properties-heading').offsetTop 
								- workspace.activeTabGroup.containerEl.offsetHeight/2, behavior:'smooth'});
							break;
						default: 					document.activeElement.scrollIntoView({behavior:'smooth',block:'center'});
					}									
					break;
				default:																												// scroll editor
				    // const pos = { line:getActiveEditor()?.getCursor().line, ch:getActiveEditor()?.getCursor().ch } || { line:0,ch:0 };
					offset = ( workspace.activeEditor !== null 
								? getActiveLeaf().containerEl.offsetTop + getActiveLeaf().containerEl.querySelector('.cm-active')?.offsetTop - workspace.activeTabGroup.containerEl.offsetHeight/2 
								: getActiveLeaf().containerEl.offsetTop - getActiveLeaf().tabHeaderEl.closest('.workspace-tab-header-container').offsetHeight
							 );
					workspace.activeTabGroup.tabsContainerEl.scrollTo({top:offset,behavior:'smooth'});
			}
		}
		const scrollSideBarItems = (target) => {
			if ( this.settings.disableScrollSidebarsIntoView === true ) { return }
			let file_explorer = workspace.getLeavesOfType('file-explorer')[0];
			let adjust_height = (file_explorer.containerEl.parentElement.offsetHeight/2) - file_explorer.containerEl.querySelector('.nav-header').offsetHeight;	// center focused item
			let file_explorer_item = file_explorer.containerEl.querySelector('.tree-item-self:is(.is-selected,.has-focus,.is-active)');
			let type = ( /workspace-tab-header|nav-header|view-header-title-container|nav-buttons-container/.test(target.className) ? 'leaf' : 'item' );
			let workspaceTabs = target.closest('.workspace-tabs');
			let workspaceTabsContainer = workspaceTabs.querySelector('.workspace-tab-container');
			let scrollEl = ( type === 'leaf' ? workspaceTabs.querySelector('.workspace-leaf.mod-active') : file_explorer_item );
			switch(true) {
				case ( /workspace-leaf-content/.test(target.className) && target.dataset.type === 'search' ):
					workspaceTabsContainer.scrollTo({top:workspace.activeLeaf.containerEl.offsetTop - workspaceTabs.querySelector('.workspace-tab-header-container').offsetHeight,behavior:'smooth'});
					break;
				case type === 'leaf':	
					workspaceTabsContainer.scrollTo({top:scrollEl.offsetTop - workspaceTabs.querySelector('.workspace-tab-header-container').offsetHeight,behavior:'smooth'});
					break;
				case type === 'item' && file_explorer_item !== null && !isVisible(file_explorer_item):				// only scroll if item is not visible
					workspaceTabsContainer.scrollTo({top:scrollEl.offsetTop - adjust_height,behavior:'smooth'});
					break;
			}
		}
		const scrollItemsIntoView = obsidian.debounce( (e) => {
			let target = e?.target || e?.containerEl;
			if ( target === undefined || target.closest('.is_continuous_mode') === null ) { return }										// ignore e.target ancestor is not in continuous mode
			switch(true) {
				case ( target.closest('.mod-sidedock.mod-left-split,.mod-sidedock.mod-right-split') !== null ):	scrollSideBarItems(target);	break;	// scroll sidebar items
				default: 					scrollToActiveLine(e); //																	scrollRootItems(target);	break;	// scroll root items
			}
		},0);
		// ARROW NAVIGATION between open leaves
		const leafArrowNavigation = (e) => {
			switch(true) {																														// Ignore arrow navigation function in these cases:
				case workspace.leftSplit.containerEl.querySelector('.tree-item-self.nav-file-title.is-selected.has-focus') !== null:
					scrollSideBarItems(workspace.leftSplit.containerEl.querySelector('.tree-item-self.nav-file-title.is-selected.has-focus'));			// scroll focused file explorer item into view
				case !getActiveLeaf()?.containerEl?.closest('.workspace-tabs')?.classList.contains('is_continuous_mode'):								// continuous mode inactive in .workspace-tabs
				case ( /input|textarea/.test(document?.activeElement?.tagName?.toLowerCase())):															// input or textarea
				case getActiveLeaf()?.containerEl?.closest('.mod-root') === null && !getActiveEditor()?.hasFocus():										// not in editor or editor unfocused
				case e.target.querySelector('.canvas-node.is-focused') && /Arrow/.test(e.key): 															// editing canvas
				case e.target.querySelector('.workspace-leaf-content[data-set="graph"]') && /Arrow/.test(e.key) && e.shiftKey:					return;	// graph active; use shift key to move graph
			}
			let active_leaf = getActiveLeaf(), activeTabGroupChildren = workspace.activeTabGroup.children, active_el = document.activeElement, el = null;
			let cursorAnchor = getActiveEditor()?.getCursor('anchor');
			if ( document.activeElement.classList.contains('cm-scroller') ) { getActiveEditor()?.focus(); }
			switch(e.key) {
				case 'ArrowUp': case 'ArrowLeft':
					switch(true) {
 						case ( /outliner-editor-view/.test(active_leaf.getViewState().type)):													return;
						case (/metadata-/.test(e.target.className) && !/metadata-properties-head/.test(e.target.className)):							// select previous metadata item
							scrollToActiveLine(e);																								return;
						case cursorAnchor?.line === 0 && cursorAnchor?.ch > 0 && e.key === 'ArrowUp':
							getActiveEditor()?.setCursor({line:0,ch:0});																		break;	// set cursor to beginning of editor
						case ( /html/.test(active_leaf.view.getViewType()) && e.key === 'ArrowLeft' ): 
							active_leaf.containerEl.querySelector('iframe').focus();
							active_leaf.containerEl.querySelector('iframe').contentWindow.scrollBy({top:-250,left:0,behavior:'smooth'});		break;
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowLeft' ):	pdfPageNavigation(e);					break;	// pdf page navigation
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowUp' ):														// pdf navigation up arrow to previous leaf
							active_leaf.view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
							active_leaf.view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');				// nobreak
						case e.target.classList.contains('inline-title') && window.getSelection().anchorOffset === 0:	 								// nobreak; cursor in inline-title
						case e.target.classList.contains('metadata-properties-heading') && e.key === 'ArrowUp':	 										// nobreak; cursor in properties header
						case e.target.classList.contains('metadata-properties-heading') && !active_el.classList.contains('is-collapsed') && e.key === 'ArrowLeft':	// nobreak
						case active_leaf.getViewState().state.mode === 'preview':																		// nobreak; leaf is in preview mode
						case cursorAnchor?.ch === 0 && cursorAnchor?.line === 0 && e.key === 'ArrowUp':													// nobreak; cursor at first line, first char
						case (!/markdown/.test(active_leaf.getViewState().type)):																		// nobreak; leaf is empty (new tab)
							if ( active_leaf.containerEl.previousSibling !== null ) {																	// ignore if first leaf
								workspace.setActiveLeaf(activeTabGroupChildren[activeTabGroupChildren.indexOf(active_leaf) - 1],{focus:true});			// make previous leaf active 
								getActiveEditor()?.setCursor({line:getActiveEditor().lastLine(),ch:getActiveEditor().lastLine().length - 1});			// select last char
								scrollToActiveLine(e);
								return;																													// 
							}
					}
					break;
				case 'ArrowDown':	case 'ArrowRight':
					switch(true) {
 						case ( /outliner-editor-view/.test(active_leaf.getViewState().type) ):													return;
						case (/metadata-/.test(e.target.className)): 								scrollToActiveLine(e);						return;
						case ( /html/.test(active_leaf.view.getViewType()) && e.key === 'ArrowRight' ):
							active_leaf.containerEl.querySelector('iframe').focus();
							active_leaf.containerEl.querySelector('iframe').contentWindow.scrollBy({top:250,left:0,behavior:'smooth'});			break;
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowRight' ):	pdfPageNavigation(e);					break;	// pdf navigation right arrow
						case ( /pdf/.test(active_leaf.view.getViewType()) && e.key === 'ArrowDown' ):													// pdf navigation down arrow to next leaf
							active_leaf.view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
							active_leaf.view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');
						case ( cursorAnchor?.ch === getActiveEditor()?.getLine(getActiveEditor().lastLine()).length && cursorAnchor?.line === getActiveEditor()?.lineCount() - 1) && e.key === 'ArrowDown':
						case active_leaf.getViewState().state.mode === 'preview':																		// leaf is in preview mode
						case (!/markdown/.test(active_leaf.getViewState().type)):																		// make next leaf active
							workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(active_leaf) + 1] || active_leaf),{focus:true});
							if ( getActiveLeaf().containerEl.querySelector('.metadata-properties-heading') ) { el = getActiveLeaf().containerEl.querySelector('.metadata-properties-heading'); }
					break;
					}
			}
			switch(true) {
				case ( /canvas|pdf/.test(getActiveLeaf().view.getViewType()) ):			 scrollItemsIntoView(e); 	return;								// scroll full-height leaves into view
				case e.target?.cmView && this.settings.disableScrollRootItemsIntoView === true:						return;
				default: scrollToActiveLine(e,el);
			}
		}
		// PDF PAGE NAVIGATION
		function pdfPageNavigation(e) {
			let focused_pdf_page = getActiveLeaf().view.viewer.containerEl.querySelector('.focused_pdf_page');
			let pdf_pages = getActiveLeaf().view.viewer.child.pdfViewer.pdfViewer._pages;
			let activeTabGroupChildren = workspace.activeTabGroup.children;
			let scroll_top = 0;
			switch(true) {
				case ( e.key === 'ArrowRight' ):
					switch(true) {
						case focused_pdf_page === null:					 pdf_pages[0].div.classList.add('focused_pdf_page'); 					break;	// add class to first page
						case focused_pdf_page.nextSibling !== null: 	 focused_pdf_page.nextSibling.classList.add('focused_pdf_page');				// add class to next page
																		 focused_pdf_page.classList.remove('focused_pdf_page');					break;	// remove class from previous page
						case focused_pdf_page.nextSibling === null:		 focused_pdf_page.classList.remove('focused_pdf_page');							// remove class from last page
							 workspace.setActiveLeaf((activeTabGroupChildren?.[activeTabGroupChildren?.indexOf(getActiveLeaf()) + 1] || getActiveLeaf()),{focus:true});	// focus next leaf
																																				break;
					}																															break;
				case ( e.key === 'ArrowLeft' ):
					switch(true) {
						case focused_pdf_page === null:					 pdf_pages[pdf_pages.length - 1].div.classList.add('focused_pdf_page');	break;	// add class to last page
						case focused_pdf_page.previousSibling !== null:	 focused_pdf_page.previousSibling.classList.add('focused_pdf_page');			// add class to previous page
																		 focused_pdf_page.classList.remove('focused_pdf_page');					break;	// remove class from last page
						case focused_pdf_page.previousSibling === null:	 focused_pdf_page.classList.remove('focused_pdf_page');							// remove class from first page
							 workspace.setActiveLeaf((activeTabGroupChildren?.[activeTabGroupChildren?.indexOf(getActiveLeaf()) - 1] || getActiveLeaf()),{focus:true});	// focus previous leaf
																																				break;
					}																															break;
			}
			scroll_top = (getActiveLeaf().view.viewer?.containerEl?.querySelector('.focused_pdf_page')?.offsetTop || 0) + getActiveLeaf().containerEl?.querySelector('.pdf-toolbar')?.offsetHeight;
			getActiveLeaf().containerEl?.querySelector('.pdf-container').scrollTo({left:0,top:scroll_top,behavior:'smooth'});
			getActiveLeaf().view.viewer?.containerEl?.querySelector('.pdf-toobar')?.click();	// needed to focus pdf viewer and enable proper page navigation by arrow keys
		}
		// OPEN ITEMS IN CONTINUOUS MODE
		const openItemsInContinuousMode = (items,action,type) => {
			let active_split, new_split, pinned_tabs = [];
			let open_files = [], included_extensions = [];
			let maximumItemsToOpen = ( this.settings.maximumItemsToOpen < 1 || this.settings.maximumItemsToOpen === undefined ? Infinity : this.settings.maximumItemsToOpen );
			workspace.getMostRecentLeaf().parent.children.forEach( child => open_files.push(child.view.file) );											// get open files
			let extensions = { 
				markdown:	['md'],
				images:		['avif','bmp','jpg','jpeg','gif','png','svg','webp'],
				canvas:		['canvas'],
				media:		['aac','aif','aiff','ape','flac','m4a','mka','mp3','ogg','opus','wav','m4v','mkv','mov','mp4','mpeg','webm'],
				pdf:		['pdf'],
				extra:		this.settings.extraFileTypes
			};
			for (const [key, value] of Object.entries(extensions)) { if ( this.settings.includedFileTypes.includes(key) ) { included_extensions.push(value); } }	// get included extensions
			// filter items:
			items = items.filter( item => item instanceof obsidian.TFile );																			// item must be obsidian.TFile
			items = items.filter( item => included_extensions.flat().includes( item.extension ));													// remove items excluded by extension
			items = items.filter( item => !this.settings.excludedNames.includes( item.basename +'.'+ item.extension ));								// remove items excluded by name
			// warnings:
			switch(true) {
				case items.length > 99 && !window.confirm('You are about to open '+ items.length +'. Are you sure you want to do this?'): return;	// warn on opening > 99 notes
				case items.length === 0:  		return alert(type === 'document links' ? 'No document links found.' : 'No readable files found.');
			}
			// pin currently open tabs to prevent tab reuse, i.e., coerce new tab creation for each item:
			workspace.iterateAllLeaves( leaf => { if ( leaf.pinned === true ) { pinned_tabs.push(leaf.id) } else { leaf.setPinned(true) } });
			switch(true) {
				case (/append/.test(action)):																	// append items...
					workspace.setActiveLeaf(workspace.getMostRecentLeaf(),{focus:true});						// set most recent leaf to active
					if ( getActiveLeaf().parent?.children.length === 1 && getActiveLeaf().getViewState().type === 'empty' ) { getActiveLeaf().setPinned(false); } 	// unpin single active empty leaf
					items = items.filter( item => !open_files.includes(item) );									// filter already open files (this filter only needed here)
					break;
				case (/replace/.test(action)):																	// close all leaves
					workspace.setActiveLeaf(workspace.getMostRecentLeaf(),{focus:true});
					workspace.activeTabGroup.children.forEach( child => { 
						sleep(0).then( () => {																	// needed to prevent detachment failure
							child.setPinned(false);																// unpin all leaves in tab group
							child.detach(); 																	// close all leaves in tab group
						}); 
					});																							// unpin & close all leaves in active tab group
					break;
				default:																						// create new group left/right/up/down
					new_split = ( /down/.test(action)	? workspace.createLeafBySplit(workspace.getMostRecentLeaf(),'horizontal',false) 
								: /up/.test(action)		? workspace.createLeafBySplit(workspace.getMostRecentLeaf(),'horizontal',true) 
								: workspace.createLeafBySplit(workspace.rootSplit,'vertical',(/left/.test(action) ? false : true )) 
					);
					workspace.setActiveLeaf(workspace.getLeafById(new_split.id),{focus:true});					// focus new group
					active_split = new_split;
					break;
			}
			// sort items:
			let sort_order = ( 
				/query block links|document links|longform/i.test(type) ? 'none' 								// open doc links, etc. in their listed order
				: /search/.test(type) ? workspace.getLeavesOfType('search')[0].view.dom.sortOrder				// open search results in search order
				: this.settings.defaultSortOrder !== undefined && this.settings.defaultSortOrder !== 'disabled' ? this.settings.defaultSortOrder	// use default sort order from settings
				: type === undefined ? 'alphabetical' 
				: workspace.getLeavesOfType('file-explorer')[0].view.sortOrder 
			);
			switch(sort_order) {
				case 'alphabetical':			items.sort((a,b) => (a.basename).localeCompare(b.basename,navigator.language,{sensitivity:'base',numeric:true}));	break;
				case 'alphabeticalReverse':		items.sort((a,b) => (b.basename).localeCompare(a.basename,navigator.language,{sensitivity:'base',numeric:true}));	break;
				case 'byModifiedTime':			items.sort((a,b) => b?.stat.mtime - a?.stat.mtime);						break;
				case 'byModifiedTimeReverse':	items.sort((a,b) => a?.stat.mtime - b?.stat.mtime);						break;
				case 'byCreatedTime':			items.sort((a,b) => b?.stat.ctime - a?.stat.ctime);						break;
				case 'byCreatedTimeReverse':	items.sort((a,b) => a?.stat.ctime - b?.stat.ctime);						break;
				case 'none':																							break;	// no sort
			}
			// open sorted items:
			for ( let i = 0; i < maximumItemsToOpen && i < items.length; i++ ) {										// limit number of items to open
				active_split = workspace.getLeaf();																		// open new tab/leaf
				active_split.openFile(items[i]);																		// open file
				active_split.setPinned(true);																			// pin each new tab/leaf to stop Obsidian reusing it to open next file in loop
			}
			// unpin tabs:
			workspace.iterateAllLeaves( leaf => { if ( !pinned_tabs.includes(leaf.id) ) { leaf.setPinned(false); } });	// reset pinned status
			workspace.activeTabGroup.containerEl.dataset.sort_order = sort_order;										// set data-sort_order
			toggleContinuousMode(this.app.appId +'_'+ workspace.activeTabGroup.id,true)									// enable continuous mode
			setTimeout(() => { workspace.setActiveLeaf(active_split?.parent.children[0],{focus:true}); },0);			// focus new group
		 }
		 // end openItemsInContinuousMode	
		 // Sort Items
		 const sortItems = async (tab_group_id,sort_order) => {
		 	let active_tab_group = getTabGroupById(tab_group_id?.split('_')[1]);
		 	let items = active_tab_group.children, sorted = [], pinned_tabs = [], active_split;
		 	if ( items === null ) { return }
			switch(sort_order) {																						// sort files
				case 'alphabetical':			sorted = items.toSorted((a,b) => 
															(a?.view.file?.basename || '').localeCompare(b?.view.file?.basename || '',navigator.language,{sensitivity:'base',numeric:true}));	break;
				case 'alphabeticalReverse':		sorted = items.toSorted((a,b) => 
															(b?.view.file?.basename || '').localeCompare(a?.view.file?.basename || '',navigator.language,{sensitivity:'base',numeric:true}));	break;
				case 'byModifiedTime':			sorted = items.toSorted((a,b) => b?.view.file?.stat?.mtime - a?.view.file?.stat?.mtime);						break;
				case 'byModifiedTimeReverse':	sorted = items.toSorted((a,b) => a?.view.file?.stat?.mtime - b?.view.file?.stat?.mtime);						break;
				case 'byCreatedTime':			sorted = items.toSorted((a,b) => b?.view.file?.stat?.ctime - a?.view.file?.stat?.ctime);						break;
				case 'byCreatedTimeReverse':	sorted = items.toSorted((a,b) => a?.view.file?.stat?.ctime - b?.view.file?.stat?.ctime);						break;
			}
			workspace.iterateAllLeaves( leaf => { if ( leaf.pinned === true ) { pinned_tabs.push(leaf.id) } else { leaf.setPinned(true) } }); // pin all currently open tabs; remember current pinned
			workspace.setActiveLeaf(active_tab_group.children[0],{focus:true});
			active_tab_group.children.forEach( child => { 
				sleep(0).then( () => {
					child.setPinned(false);																				// unpin all leaves in active tab group
					child.detach(); 																					// close all leaves in active tab group
				}); 
			});																											// unpin & close all leaves in active tab group
			sorted.forEach( item => {																					// open the files
				active_split = workspace.getLeaf();																		// open new tab/leaf
				active_split.openFile(item.view.file);																	// open file
				active_split.setPinned(true);																			// pin new tab/leaf to prevent Obsidian reusing it to open next file in loop
			});
			workspace.iterateAllLeaves( leaf => { if ( !pinned_tabs.includes(leaf.id) ) { leaf.setPinned(false); } });	// unpin all tabs, except for originally pinned tabs
			active_tab_group.containerEl.dataset.sort_order = sort_order;												// set data-sort_order
		 };
		// REGISTER DOM EVENTS
		this.registerDomEvent(window,'click', (e) => {
			let active_leaf = workspace.activeTabGroup.children.find(child => child.tabHeaderEl.className.includes('is-active'));
			switch(true) {
				case e.target.classList.contains('menu-item-title'):																							// focus tab and scroll into view
					sleep(0).then( () => { 
						active_leaf = workspace.activeTabGroup.children.find(child => child.tabHeaderEl.className.includes('is-active'));
						workspace.setActiveLeaf(active_leaf,{focus:true}); 
					});																																			// nobreak
				case ( e.target.closest('.workspace-leaf')?.classList.contains('mod-active') && e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode') ):
				case ( /workspace-tab-header|nav-header|view-header-title-container/.test(e.target.className) && workspace.activeTabGroup.containerEl.classList.contains('is_continuous_mode') ):
					switch(true) {
						case getActiveLeaf().containerEl.querySelector('.cm-active') !== null && !/workspace-tab-header/.test(e.target.className):
							scrollToActiveLine(e);																												// scroll to active editor line
							scrollTabHeader();
							break;
						default: 																		scrollItemsIntoView(e);									// click tab, scroll into view
					}																																	break;
				case e.target.classList.contains('continuous_mode_open_links_button'):																			// nobreak
				case e.target.closest('.continuous_mode_open_links_button') !== null:					showLinksMenu(e);								break;	// open links in continuous mode
			}
		});
		this.registerDomEvent(window,'mousedown', (e) => {
			switch(true) {
				case e.target.closest('.workspace-tab-header') !== null:																						// focus active tab group on mousedown
				case e.target.closest('.workspace-tab-header-tab-list') !== null: {																				// focus active tab group on menu
					let active_tab_group = getTabGroupById(e.target.closest('.workspace-tabs').dataset.tab_group_id.split('_')[1]);
					let active_tab = active_tab_group.tabHeaderEls.find(tab => tab.classList.contains('is-active'));
					let active_tab_index = active_tab_group.tabHeaderEls.indexOf(active_tab);
					workspace.setActiveLeaf(active_tab_group.children[active_tab_index],{focus:true});													break; }
				case (e.buttons === 2 || e.ctrlKey) && e.target.closest('.longform-explorer') !== null:		getLongformItems(e);						break;	// show longform menu
			}
		});
		this.registerDomEvent(document,'mouseup', (e) => {
			switch(true) {
				case ( e.target.closest('.nav-folder.tree-item') !== null && e.target.closest('.nav-folder-collapse-indicator') === null && this.settings.allowSingleClickOpenFolder === true ): 
					{		
						let path = e.target.closest('.nav-folder-title').dataset.path, files = this.app.vault.getFolderByPath(path).children;
						let action = ( this.settings.allowSingleClickOpenFolderAction || 'open_left' );
						openItemsInContinuousMode(files,action,'folder');																				break;	// open folders on single click
					}
			}
		});
		this.registerDomEvent(window,'mouseover', (e) => {
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
		this.registerDomEvent(document,'keydown', (e) => {
			if ( /Arrow/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ) { 
				leafArrowNavigation(e);
			}
		});	
		this.registerDomEvent(window,'dragstart', (e) => {
			if ( !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode')) { return; }
			if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }					// get initial tab header index for onTabHeaderDragEnd()
		});
		// ADD CONTEXTUAL MENU ITEMS
		const addContinuousModeMenuItem = (item, tab_group_id, leaf) => {																// add continuous mode menu items (toggle, headers, sort)
			let tab_group = getTabGroupById(tab_group_id?.split('_')[1]), tab_group_el = tab_group.containerEl, tab_group_classList = tab_group_el.classList;
			item.setTitle('Continuous Mode')
				.setIcon('scroll-text')
				.setSection( leaf ? 'pane' : 'action' )
				.setSubmenu().addItem((item2) => {
					item2.setTitle('Toggle Continuous Mode')
					.setIcon('scroll-text')
					.setChecked( tab_group_classList.contains('is_continuous_mode') ? true : false )
					.onClick(async () => { 
						toggleContinuousMode(tab_group_id || this.app.appId+'_'+workspace.activeTabGroup.id);
					})
				})
				.addItem((item3) => {
					item3.setTitle( tab_group_classList.contains('hide_note_titles') ? 'Show note headers' : 'Hide note headers' )
					.setIcon('panelTopDashed')
					.setDisabled( tab_group_classList.contains('is_continuous_mode') ? false : true )
					.onClick(async () => { 
						workspace.activeTabGroup.containerEl.classList.toggle('hide_note_titles');
					})
				})
				.addItem((item4) => {
					item4.setTitle('Change sort order')
						.setIcon('arrow-up-narrow-wide')
						.setDisabled( tab_group.children.length > 1 && tab_group_classList.contains('is_continuous_mode') ? false : true )
						.setSubmenu()
							.addItem((item5) => {
							item5.setTitle('File name (A to Z)')
								.setChecked( tab_group_el.dataset.sort_order === 'alphabetical' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'alphabetical');
								})
							})
							.addItem((item6) => {
								item6.setTitle('File name (Z to A)')
								.setChecked( tab_group_el.dataset.sort_order === 'alphabeticalReverse' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'alphabeticalReverse');
								})
							})
							.addSeparator()
							.addItem((item7) => {
								item7.setTitle('Modified time (new to old)')
								.setChecked( tab_group_el.dataset.sort_order === 'byModifiedTime' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byModifiedTime');
								})
							})
							.addItem((item8) => {
								item8.setTitle('Modified time (old to new)')
								.setChecked( tab_group_el.dataset.sort_order === 'byModifiedTimeReverse' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byModifiedTimeReverse');
								})
							})
							.addSeparator()
							.addItem((item9) => {
								item9.setTitle('Created time (new to old)')
								.setChecked( tab_group_el.dataset.sort_order === 'byCreatedTime' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byCreatedTime');
								})
							})
							.addItem((item10) => {
								item10.setTitle('Created time (old to new)')
								.setChecked( tab_group_el.dataset.sort_order === 'byCreatedTimeReverse' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byCreatedTimeReverse');
								})
							})
			})
			.addSeparator();
		}
		const openItemsInContinuousModeMenuItems = (item,file,type) => {																			// open items in continuous mode menu items
			type = ( type !== undefined ? type : file instanceof obsidian.TFolder ? 'folder contents' : file instanceof obsidian.TFile ? 'file' : null );
			file = ( file instanceof obsidian.TFile ? [file] : file instanceof obsidian.TFolder ? file.children : file );
			item.setTitle('Continuous Mode')
				.setIcon('scroll-text')
				.setSection( 'open')
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
					.addItem((item5) => {
						item5.setTitle('Open '+type+' in new split up')
						.setIcon('panel-top-close')
						.onClick(async () => { openItemsInContinuousMode(file,'open_up',type); })
					})
					.addItem((item4) => {
						item4.setTitle('Open '+type+' in new split down')
						.setIcon('panel-bottom-close')
						.onClick(async () => { openItemsInContinuousMode(file,'open_down',type); })
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
		const showLinksMenu = (e) => {
			const open_links_menu = new obsidian.Menu(); let links, files = [];
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
			open_links_menu.addItem( item => openItemsInContinuousModeMenuItems(item,files,'query block links') );
			open_links_menu.showAtMouseEvent(e);
		}
		// OTHER PLUG-INS SUPPORT
		// Longform async
		const getLongformItems = (object) => {																											// object = mousedown event or file
			let longform_explorer = workspace.getLeavesOfType('VIEW_TYPE_LONGFORM_EXPLORER')[0].view.contentEl.children[0];
			let longform_scenes_arr = Array.from(longform_explorer.querySelectorAll('#scene-list > ul > li'));
			let target_item, filtered_items, paths = [];
			let kind = ( object.target?.classList.contains('current-draft-path') ? 'project' : 'scenes' );
			switch(kind) {
				case 'project': 
					const open_longform_menu = new obsidian.Menu(); 
					longform_scenes_arr.forEach( scene => { paths.push( scene.querySelector('.scene-container').getAttribute('data-scene-path') ); });	// get all scenes paths
					open_longform_menu.setUseNativeMenu(false);
					open_longform_menu.addItem( item => openItemsInContinuousModeMenuItems(item,getFilesFromLinks(paths),'Longform project') );			// add the menu item
					open_longform_menu.showAtMouseEvent(object);																				break;
				case 'scenes': 
					if ( longform_scenes_arr === undefined ) { return }
					target_item = longform_scenes_arr.find( item => item?.querySelector('.scene-container').getAttribute('data-scene-path') === object.path );	// get the clicked item
					filtered_items = ( target_item ===  undefined ? undefined : [target_item] );															// add target item to the filtered list
					longform_scenes_arr = longform_scenes_arr.slice(longform_scenes_arr.indexOf(target_item));												// remove items before target
					for ( let i = 1; i < longform_scenes_arr.length; i++ ) {																				// start @ 1 => don't filter target item
						if ( longform_scenes_arr[i].dataset.indent > target_item.dataset.indent ) { filtered_items.push(longform_scenes_arr[i]) } else { break }
					};
					if ( filtered_items ) {
						filtered_items.forEach( filtered_item => { paths.push( filtered_item.querySelector('.scene-container').getAttribute('data-scene-path') ); });	// get paths
					}
					return getFilesFromLinks(paths);
			}
		}
		// CONTEXT MENU EVENTS
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu,editor/*,info*/) => {																			// on editor-menu
				menu.addItem((item) => { 
					let links = getDocumentLinks(editor.editorComponent.view.file,editor.editorComponent.view.leaf), files = getFilesFromLinks(links);
					addContinuousModeMenuItem(item,editor?.containerEl?.closest('.workspace-tabs')?.dataset?.tab_group_id)								// add continuous mode items
					openItemsInContinuousModeMenuItems(item,files,'document links')																		// add open document links items
				});
			})
		);
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu,file,source,leaf) => {																				// on file-menu
				let longform_index_file, items, links, files;
				switch(true) {
					case (/link-context-menu/.test(source)):																							// click link
						menu.addItem((item) => { 
							openItemsInContinuousModeMenuItems(item,file,'link');																		// add open link items
						});																														break;
					case (/file-explorer-context-menu/.test(source)):																					// link context menu/file-explorer menu
						menu.addItem((item) => { 
							openItemsInContinuousModeMenuItems(item,file);																				// add open files items
						});																														break;
					case (/file-explorer/.test(source)):																								// file-tree-alternative plugin support
						if ( this.app.workspace.getActiveViewOfType(obsidian.View).leaf === this.app.workspace.getLeavesOfType('file-tree-view')[0] ) {
							menu.addItem((item) => { 
								openItemsInContinuousModeMenuItems(item,file);
							});
						}																														break;
					case (/longform/.test(source)):																										// longform plugin support
						items = getLongformItems(file,'scenes');
						menu.addItem((item) => { 
							openItemsInContinuousModeMenuItems(item,items,'Longform scenes')
						});																														break;
					default:
						menu.addItem((item) => {																										// file menu
							links = getDocumentLinks(file,leaf), files = getFilesFromLinks(links);
							addContinuousModeMenuItem(item,leaf?.containerEl?.closest('.workspace-tabs')?.dataset?.tab_group_id, leaf, links)			// add continuous mode items
							if ( leaf.containerEl.closest('.mod-sidedock') === null ) {
								openItemsInContinuousModeMenuItems(item,files,'document links');														// add open document links items
							}
						});																														break;
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on('files-menu', (menu,files,source) => {																				// on files-menu
				switch(true) {
					case (/link-context-menu|file-explorer-context-menu/.test(source)):																	// open selected files in CM
						menu.addItem((item) => { openItemsInContinuousModeMenuItems(item,files,'selected files') });							break;
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on('leaf-menu', (menu,leaf) => {																					// on leaf-menu (e.g. sidebar tab headers)
				if ( leaf.containerEl.closest('.mod-left-split,.mod-right-split') ) {
					menu.addItem((item) => { addContinuousModeMenuItem(item,leaf?.containerEl?.closest('.workspace-tabs').dataset?.tab_group_id) });
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on('tab-group-menu', (menu,tab_group) => {																				// on tab-group-menu
				menu.addItem((item) => { addContinuousModeMenuItem(item,tab_group?.containerEl?.dataset?.tab_group_id) });
			})
		);
		this.registerEvent(
			this.app.workspace.on('search:results-menu', (menu) => {																					// on search-results-menu
				menu.addItem((item) => {
					let files = [], search_results = this.app.workspace.getLeavesOfType("search")[0].view.dom.resultDomLookup.values();
					for ( const value of search_results ) { files.push(value.file); };
					openItemsInContinuousModeMenuItems(item,files,'search results');
				})
			})
		);
		// OTHER EVENTS
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				initContinuousMode();
			//	scrollItemsIntoView();
			})
		);
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (e) => {
			//	scrollItemsIntoView(e);
			//	scrollRootItems('tabs');
			})
		);
		// ADD COMMAND PALETTE ITEMS
		
		['active','left','right'].forEach( side => {													// add commands: toggle continuous mode in active tab group, left/right sidebars
			this.addCommand({
				id: 	( side === 'active' ? 'toggle-continuous-mode-active' : 'toggle-continuous-mode-in-'+side+'-sidebar' ),
				name:	( side === 'active' ? 'Toggle Continuous Mode in active tab group' : 'Toggle Continuous Mode in '+side+' sidebar' ),
				callback: () => {
					switch(side) {
						case 'left':	workspace.leftSplit.containerEl.querySelectorAll('.workspace-tabs').forEach( tab_group => toggleContinuousMode(tab_group.dataset.tab_group_id) );	break;
						case 'right':	workspace.rightSplit.containerEl.querySelectorAll('.workspace-tabs').forEach( tab_group => toggleContinuousMode(tab_group.dataset.tab_group_id) );	break;
						default: 		toggleContinuousMode(workspace.activeTabGroup.containerEl.dataset.tab_group_id);
					}
				}
			});
			this.addCommand({																			// add command: toggle display of leaf headers
				id: 	( side === 'active' ? 'toggle-headers-active-tab-group' : 'toggle-headers-in-'+side+'-sidebar' ),
				name:	( side === 'active' ? 'Toggle visibility of note titles in active tab group' : 'Toggle visibility of note titles '+side+' sidebar' ),
				callback: () => { 
					switch(side) {
						case 'left':	workspace.leftSplit.containerEl.querySelectorAll('.workspace-tabs').forEach( tab_group => tab_group.classList.toggle('hide_note_titles') );		break;
						case 'right':	workspace.rightSplit.containerEl.querySelectorAll('.workspace-tabs').forEach( tab_group => tab_group.classList.toggle('hide_note_titles') );	break;
						default: 		workspace.activeTabGroup.containerEl.classList.toggle('hide_note_titles');
					}
				},
			});
		});
		['left','right','up','down','append','replace'].forEach( action => {							// add commands: open selected file explorer items in Continuous Mode
			this.addCommand({
				id: 'open-folder-in-new-split-'+action,
				name: 'Open selected file explorer item in new split '+action,
				callback: () => {
					let items = workspace.getLeavesOfType('file-explorer')[0].view.tree.focusedItem?.file?.children || workspace.getLeavesOfType('file-explorer')[0].view.tree?.focusedItem?.file || workspace.getLeavesOfType('file-explorer')[0].view.tree?.activeDom?.file;
					if ( !items ) { 
						alert('No file explorer item selected') 
					} else {
						openItemsInContinuousMode(items,'open_'+action,'folder'); 
					}
				},
			});
		});
		['left','right','up','down','append','replace'].forEach( action => {							// add commands: open document links and search results in Continuous Mode
			['document links','search results'].forEach( type => {
				this.addCommand({																				
					id:		( action === 'append' ? 'append-'+type.replace(/ /,'-')+'-in-active-tab-group' 
							: action === 'replace' ? 'replace-active-tab-group-with-'+type.replace(/ /,'-') 
							: 'open-'+type.replace(/ /,'-')+'-in-new-split-'+action ),
					name:	( action === 'append' ? 'Append '+type+' in active tab group' 
							: action === 'replace' ? 'Replace active tab group with '+type 
							: 'Open '+(type === 'document links' ? 'active' : type === 'search results' ? 'current' : '' )+' '+type+' in new split '+action ),
					callback: () => { 
						let items;
						switch(true) {
							case type === 'document links': items = getFilesFromLinks(getDocumentLinks(getActiveLeaf().view.file,getActiveLeaf()));	break;
							case type === 'search results': items = getFilesFromSearchResults();													break;
						}
						openItemsInContinuousMode(items,action,type);
					}
				});
			});
		});		
		Object.entries( {'alphabetical':'file name (A to Z)','alphabeticalReverse':'file name (Z to A)','byModifiedTime':'modified time (new to old)','byModifiedTimeReverse':'modified time (old to new)','byCreatedTime':'created time (new to old)','byCreatedTimeReverse':'created time (old to new)'} ).forEach( ([key,value]) => {
			this.addCommand({
				id: 'sort-files-'+key,
				name: 'Sort active tab group by '+value,
				callback: () => {
					if ( workspace.activeTabGroup.containerEl.classList.contains('is_continuous_mode') ) {
						sortItems(workspace.activeTabGroup.containerEl.dataset.tab_group_id,key);
					} else {
						alert('Active tab group is not in continuous mode.');
					}
				}
			});
		});

    } 
    // end onload
    // on plugin unload
	onunload() {
		console.log('Unloading the Continuous Mode plugin.');
		this.app.workspace.containerEl.querySelectorAll('.workspace-tabs').forEach( 
			el => {
				el?.classList?.remove('is_continuous_mode','hide_note_titles'); 
				delete el?.dataset?.tab_group_id; delete el?.dataset?.sort_order; 
				el?.querySelectorAll('.continuous_mode_open_links_button').forEach(btn => btn?.remove() );
			}
		)
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
        this.containerEl.createEl("h2", { text: 'Opening Multiple Items in Continuous Mode' })
        this.containerEl.createEl("div", { text: 'You can open multiple items in Continuous Mode via commands in the command palette or the contextual menus available in various parts of the Obsidian UI. Contextual menus are available in File Explorer items, Search Results, File Menu, Tab Menu, and the Editor Menu. The settings below allow you to control which items are opened, how many are opened at a time, and their sort order, among other things.', cls: 'setting-item-description' })
		new obsidian.Setting(containerEl).setName('Filter included file types and items').setDesc('Select file types and items to include when using the “Open in Continuous Mode” commands and contextual menu items. (Note: toggling off these settings does not prevent any of these file types from being opened manually.)').setClass("cm-setting-indent-no-bullet");
		new obsidian.Setting(containerEl).setName('Include markdown').setDesc('Default.').setClass("cm-setting-indent")
			.addToggle( toggle => toggle.setValue(this.plugin.settings.includedFileTypes.includes('markdown') ? true : false)
			.onChange(async (value) => {
				(value === true || this.plugin.settings.includedFileTypes.length === 0 ? this.plugin.settings.includedFileTypes.push('markdown') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('markdown'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include images').setDesc('Natively supported file types: avif, bmp, gif, jpg, png, svg, webp.').setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includedFileTypes.includes('images'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.includedFileTypes.push('images') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('images'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include canvas files').setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includedFileTypes.includes('canvas'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.includedFileTypes.push('canvas') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('canvas'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include media').setDesc('Natively supported file types: aac, aif, aiff, ape, flac, m4a, mka, mp3, ogg, opus, wav, m4v, mkv, mov, mp4, mpeg, webm.').setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includedFileTypes.includes('media'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.includedFileTypes.push('media') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('media'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include pdfs').setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includedFileTypes.includes('pdf'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.includedFileTypes.push('pdf') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('pdf'),1));
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include other file extensions').setDesc('If you have installed plugins that allow Obsidian to support file types or extensions not included above, add the file extensions here, comma-separated.').setClass("cm-setting-indent")
			.addText((value) => value.setPlaceholder("e.g. html, js, py, etc.").setValue(this.plugin.settings.extraFileTypes?.join(',') || '')
			.onChange(async (value) => {
				this.plugin.settings.extraFileTypes = [...new Set(value.split(','))].filter(Boolean);									// add unique file types, remove empty items
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Excluded files').setDesc('Exclude files by name and/or extension. Comma-separated, case-sensitive, partial name and Regex allowed. (Note: If the file name contains commas, use periods [wildcard character] instead.) Extensions added here will override the settings in the above categories.').setClass("cm-setting-indent")
			.addText((value) => value.setPlaceholder("e.g., “index.md”").setValue(this.plugin.settings.excludedNames?.join(',') || '')
			.onChange(async (value) => {
				this.plugin.settings.excludedNames = [...new Set(value.split(','))].filter(Boolean);									// add unique excluded names, remove empty items
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include embedded files').setDesc('If true, include embedded files when opening all document links in Continuous Mode.').setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.excludeEmbeddedFiles)
			.onChange(async (value) => {
				this.plugin.settings.excludeEmbeddedFiles = value;
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Include all Dataview and Query block links').setDesc('If true, include links in Dataview and Query blocks when opening all document links in Continuous Mode. Whether true or false, links from individual blocks can still be opened directly from the block menu.').setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includeBlockLinks)
			.onChange(async (value) => {
				this.plugin.settings.includeBlockLinks = value;
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Maximum number of items to open at one time').setDesc('Leave empty (or set to 0) to open all items at once. Otherwise, setting a value here allows you to incrementally open the items in a folder (or search results or document links) by repeatedly selecting “Open or append items in Continuous Mode.” Useful for dealing with folders containing a large number of items.')
			.addText((A) => A.setPlaceholder("").setValue(this.plugin.settings.maximumItemsToOpen?.toString() || '')
			.onChange(async (value) => {
				if ( isNaN(Number(value)) || !Number.isInteger(Number(value)) ) { 
					alert('Please enter a positive integer, 0, or leave blank.');
					A.setValue('');
				} else {
					this.plugin.settings.maximumItemsToOpen = Number(value.trim()) || 0;									// add unique excluded names, remove empty items
					await this.plugin.saveSettings();
				}
		}));
		new obsidian.Setting(containerEl).setName('Default sort order:').setDesc('If no value is set, items will be sorted according to the current sort order of the source (e.g., the file explorer, search results, etc.)')
			.addDropdown((dropDown) => {
				dropDown.addOption("disabled", "—");
				dropDown.addOption("alphabetical", "File name (A to Z)");
				dropDown.addOption("alphabeticalReverse", "File name (Z to A)");
				dropDown.addOption("byModifiedTime", "Modified Time (new to old)");
				dropDown.addOption("byModifiedTimeReverse", "Modified Time (old to new)");
				dropDown.addOption("byCreatedTime", "Created Time (new to old)");
				dropDown.addOption("byCreatedTimeReverse", "Created Time (old to new)");
				dropDown.setValue( ( this.plugin.settings.defaultSortOrder === undefined || this.plugin.settings.defaultSortOrder === false ? 'disabled' : this.plugin.settings.defaultSortOrder ) )
				dropDown.onChange(async (value) => {
					this.plugin.settings.defaultSortOrder = value;
					await this.plugin.saveSettings();
		  });
		});
        new obsidian.Setting(containerEl).setName('Allow single click to open File Explorer folders in Continuous Mode').setDesc('Enable this setting to make it possible to open all items in a File Explorer folder with a single click. Set the default single click action below.')
        	.addToggle( (A) => A.setValue(this.plugin.settings.allowSingleClickOpenFolder)
        	.onChange(async (value) => {
        		this.plugin.settings.allowSingleClickOpenFolder = value;
        		await this.plugin.saveSettings();
        }));
		new obsidian.Setting(containerEl).setName('Set default single-click action:').setClass("cm-setting-indent")
			.addDropdown((dropDown) => {
				dropDown.addOption("disabled", "—");
				dropDown.addOption("open_left", "Open folder contents in new split left");
				dropDown.addOption("open_right", "Open folder contents in new split right");
				dropDown.addOption("open_up", "Open folder contents in new split up");
				dropDown.addOption("open_down", "Open folder contents in new split down");
				dropDown.addOption("append", "Append folder contents in active tab group");
				dropDown.addOption("replace", "Replace active tab group with folder contents");
				dropDown.setValue( ( this.plugin.settings.allowSingleClickOpenFolderAction === undefined || this.plugin.settings.allowSingleClickOpenFolder === false ? 'disabled' : this.plugin.settings.allowSingleClickOpenFolderAction ) )
				dropDown.onChange(async (value) => {
					this.plugin.settings.allowSingleClickOpenFolderAction = value;
					await this.plugin.saveSettings();
		  });
		});
        this.containerEl.createEl("h2", { text: "Other Settings" });
		new obsidian.Setting(containerEl).setName('Disable scroll active note into view').setDesc('If you find the plugin’s default scroll behavior on arrow navigation (which keeps the insertion point more or less centered by line/paragraph, similar to “typewriter mode”) distracting, enable this setting. Clicking tab headers will still scroll notes into view.')
			.addToggle( A => A.setValue(this.plugin.settings.disableScrollRootItemsIntoView)
			.onChange(async (value) => {
				this.plugin.settings.disableScrollRootItemsIntoView = value;
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Disable scroll sidebar items into view').setDesc('Don’t scroll sidebar tree items into view when an item is selected or becomes active.')
			.addToggle( A => A.setValue(this.plugin.settings.disableScrollSidebarsIntoView)
			.onChange(async (value) => {
				this.plugin.settings.disableScrollSidebarsIntoView = value;
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Clear stored data').setDesc('Empty the list of stored tab groups, ignoring currently open tab groups with continuous mode active. This optional action prevents the list from getting unwieldy or cluttered with stale data, which can happen if you frequently open and close new tab groups.')
			.addButton((button) => {
				button.setButtonText('Clear');
				button.buttonEl.addEventListener("click", async () => {
					if ( window.confirm('Are you sure you want to clear all stored data?') ) {
						this.plugin.settings.tabGroupIds = [];																				// empty stored tabGroupIds
						this.app.workspace.rootSplit.children.forEach( child => { 
							( child.containerEl.classList.contains('is_continuous_mode') ? this.plugin.settings.tabGroupIds.push(this.app.appId +'_'+ child.id) : null ) 
						}); 																												// add back currently active tabGroupIds
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
