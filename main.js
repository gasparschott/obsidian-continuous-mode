'use strict';

let obsidian = require('obsidian');

let DEFAULT_SETTINGS = {
	'allowSingleClickOpenFolder': 		false,
	'allowSingleClickOpenFolderAction':	'disabled',
	'alwaysHideNoteHeaders':			false,
	'alwaysOpenInContinuousMode':		false,
	'compactModeTabGroupIds':			[],
	'defaultSortOrder':					'alphabetical',
	'disableScrollRootItemsIntoView':	false,
	'disableScrollSidebarsIntoView':	false,
	'disableWarnings':					false,
	'excludedNames':					[],
	'extraFileTypes':					[],
	'includeBlockLinks':				false,
	'includeEmbeddedFiles':				false,
	'includedFileTypes':				['markdown'],
	"maximumItemsToOpen":				'0',
	'onlyShowFileName':					false,
	'tabGroupIds':						[],
};

class ContinuousModePlugin extends obsidian.Plugin {
    async onload() {
		// console.log('Loading the Continuous Mode plugin.');
		await this.loadSettings();
		this.addSettingTab(new ContinuousModeSettings(this.app, this));
		/*-----------------------------------------------*/
		// HELPERS
		const workspace = this.app.workspace; 
		const getAllTabGroups = () => {
			let root_children = workspace.rootSplit?.children || [], 
				left_children = workspace.leftSplit?.children || [], 
				right_children = workspace.rightSplit?.children || [], 
				floating_children = workspace.floatingSplit?.children || [],
				all_tab_groups = [];
			let nodes = (floating_children).concat(root_children,right_children,left_children);
			if ( nodes[0] === undefined ) { return []; }
			nodes?.forEach( node => { if ( node && node.type === 'tabs' ) { all_tab_groups.push(node) } else { all_tab_groups = getTabGroupsRecursively(node,all_tab_groups) } });
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
		const getTabGroupById = (id) =>		{ return getAllTabGroups()?.find( tab_group => tab_group.id === id ); }			// get tab group by id, not dataset-tab-group-id
		const getTabHeaderIndex = (e) =>	{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
		const getActiveLeaf = () =>			{ return workspace.activeTabGroup.children?.find( child => child.tabHeaderEl?.className?.includes('active')) ?? workspace.activeTabGroup.children?.[0]; }
		const getActiveEditor = () =>		{ return workspace.activeEditor?.editor; }
		const getDocumentLinks = (file,leaf) => {																										// get document links
			let document_links = (this.app.metadataCache.getFileCache(file).links)?.map( link => link?.link ) || [];									// get document links from metadata cache
			let document_embeds = (this.app.metadataCache.getFileCache(file)?.embeds)?.map( link => link?.link ) || [];									// get document embeds from metadata cache
			if ( this.settings.includeEmbeddedFiles === true ) { document_links = document_links.concat(document_embeds); }								// concat doc links & embedded files
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
		const findDuplicateLeaves = (leaves) => {
		  const seen = [], duplicateLeaves = [];
			leaves.forEach(leaf => {
				if ( !seen.includes(leaf.view.file) ) { seen.push(leaf.view.file); } else { duplicateLeaves.push(leaf); }
			});
			return duplicateLeaves;
		}
		const isVisible = (el) => {																														// determine if a scrollable el is visible
		    const rect = el.getBoundingClientRect();
			return ( rect.top >= el.offsetHeight && rect.bottom <= (window.innerHeight - el.offsetHeight || document.documentElement.clientHeight - el.offsetHeight) );
		}
		const isContinuousMode = () => {
			return workspace.activeTabGroup.containerEl.classList.contains('.is_continuous_mode');
		}
		const isCompactMode = () => {
			return !!workspace.rootSplit.containerEl.querySelectorAll('.is_compact_mode,.is_semi_compact_mode').length;
		}
		/*-----------------------------------------------*/
		// HOUSEKEEPING
		const resetPinnedLeaves = () => {
			workspace.iterateAllLeaves( leaf => {
				switch(true) {																							// unpin all tabs, except originally pinned tabs
					case leaf.containerEl.classList.contains('pinned'):  		leaf.setPinned(true);	leaf.containerEl.classList.remove('pinned');	break;
					case leaf.containerEl.classList.contains('temp_pinned'):	leaf.setPinned(false);	
																				leaf.containerEl.classList.remove('temp_pinned');	leaf.tabHeaderEl.classList.remove('temp_pinned');	break;
					default:													leaf.setPinned(false); 
				}
			});
		}
		const updateSavedIds = ( (tab_group_id,type,action) => {																		// prune saved ids
			let app_id = this.app.appId, tab_group_ids = []; getAllTabGroups().forEach( tab_group => tab_group_ids.push(app_id+'_'+tab_group.id) );
			let saved_continuous_mode_ids = this.settings.tabGroupIds, 				filtered_continuous_mode_ids = [];
			let saved_compact_mode_ids 	  = this.settings.compactModeTabGroupIds,	filtered_compact_mode_ids    = [];
			switch(true) {
				case tab_group_id === undefined:																						// on active leaf change, prune saved ids
					saved_continuous_mode_ids.forEach( saved_id => {
						if (saved_id.split('_')[0] === app_id && tab_group_ids.includes(saved_id) || saved_id.split('_')[0] !== app_id) {
							filtered_continuous_mode_ids.push(saved_id) 
						}
					});
					saved_compact_mode_ids.forEach( saved_id => {
						if (saved_id.split('_')[0] === app_id && tab_group_ids.includes(saved_id.slice(0,-1)) || saved_id.split('_')[0] !== app_id) {
							filtered_compact_mode_ids.push(saved_id) 
						}
					});
					this.settings.tabGroupIds = [...new Set(filtered_continuous_mode_ids)];			
					this.settings.compactModeTabGroupIds = [...new Set(filtered_compact_mode_ids)];			
					this.saveSettings();																						break;	// save the settings
				case ( /continuous/.test(type) ):
					if ( action === true ) {
						saved_continuous_mode_ids.push(tab_group_id);																				// add id
						filtered_continuous_mode_ids = saved_continuous_mode_ids;
					} else {
						filtered_continuous_mode_ids = saved_continuous_mode_ids.filter( saved_tab_id => !saved_tab_id.includes(tab_group_id) );	// remove id
					}
					this.settings.tabGroupIds = [...new Set(filtered_continuous_mode_ids)];										break;
				case ( /compact_mode/.test(type) ):
					filtered_compact_mode_ids = saved_compact_mode_ids.filter( 
						saved_tab_id => !(saved_tab_id.slice(0,-1)).includes(tab_group_id.slice(0,-1))									// mode can be compact or semi_compact, so just remove id
					);
					if ( action === undefined || action === true ) { filtered_compact_mode_ids.push(tab_group_id); }					// add id
					this.settings.compactModeTabGroupIds = [...new Set(filtered_compact_mode_ids)];								break;
			}
			this.saveSettings();																										// save the settings
		});
		/*-----------------------------------------------*/
		// ICONS
		const icons = {
			appendFolder: `<svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-down" version="1.1" id="svg2" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"> <defs id="defs2" /> <rect width="18" height="18" x="3" y="3" rx="2" id="rect1" /> <path d="m 12,8 v 8" id="path1" /> <path d="m 8,12 4,4 4,-4" id="path2" /> <path d="M 15.999999,8 H 8" id="path1-2" /></svg>`,
			panelTopDashed: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-top-dashed"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M14 9h1"/><path d="M19 9h2"/><path d="M3 9h2"/><path d="M9 9h1"/></svg>`,
			replaceFolder: `<svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-down" version="1.1" id="svg2" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"> <defs id="defs2" /> <rect width="18" height="18" x="3" y="3" rx="2" id="rect1" /> <path d="m 8,14 4,4 4,-4" id="path2" /> <path d="m 8,9.9999586 4,-4 4,4" id="path2-3" /></svg>`,
			chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-chevron-down"><path d="m6 9 6 6 6-6"></path></svg>`,
			compactMode: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 1h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2M10 5.5H1M10 10H1M10 14.5H1M10 19V1"/></svg>`,
			semiCompactMode: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 1h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2M10 5.5H1M10 14.5H1M10 19V1"/></svg>`
		} 
		const addIcons = () => {
		  Object.keys(icons).forEach((key) => {
			  (0, obsidian.addIcon)(key, icons[key]);
		  });
		};
		/*-----------------------------------------------*/
		// TOGGLE CONTINUOUS MODE obsidian.debounce( () => {
		const toggleContinuousMode = (tab_group_id,bool) => {
			let id = tab_group_id?.split('_')?.[1];
			let saved_tab_group_ids = this.settings.tabGroupIds;
			let tab_group = getTabGroupById(id);
			if ( !tab_group || this.app.appId !== tab_group_id?.split('_')?.[0] )											{ return }
			switch(true) {
				case tab_group.containerEl?.classList?.contains('is_continuous_mode') && bool !== true:									// remove continuous mode
					workspace.activeTabGroup.children.forEach(leaf => { 
						leaf.containerEl.querySelectorAll('.continuous_mode_open_links_button').forEach( btn => btn?.remove() );
						if ( !leaf.containerEl.classList.contains('mod-active') ) { leaf.containerEl.style.display = 'none'; }
					});
					tab_group.containerEl?.classList?.remove('is_continuous_mode','is_compact_mode','is_semi_compact_mode','hide_note_titles','show_note_titles','only_show_file_name');	break;
				default:																												// add continuous mode (e.g., on app launch)
					tab_group.containerEl?.classList?.add('is_continuous_mode');														// add continuous mode class
					if ( this.settings.alwaysHideNoteHeaders === true && !tab_group.containerEl?.classList?.contains('show_note_titles') ) {
						tab_group.containerEl?.classList?.add('hide_note_titles');
					} else {
						tab_group.containerEl?.classList?.add('show_note_titles');
					}
					if ( this.settings.onlyShowFileName === true ) { tab_group.containerEl?.classList?.add('only_show_file_name'); }	break;
			}
			updateSavedIds(tab_group_id,'continuous',bool);
		}
		// TOGGLE COMPACT MODE
		const toggleCompactMode = obsidian.debounce( (tab_group_id,bool1,bool2) => { // bool1 === false ? compact mode : semi-compact mode; bool2 === true ? restore compact mode : null
			let mode = ( bool1 === false || tab_group_id.endsWith('–') ? 'is_compact_mode' : 'is_semi_compact_mode' );
			let mode_id = ( bool2 === true && /\+$|\-$]/m.test(tab_group_id) ? tab_group_id.slice(-1) : bool1 === false ? '–' : '+' );	// get tab group id compact mode suffix
			tab_group_id = ( tab_group_id?.endsWith('–') || tab_group_id?.endsWith('+') ? tab_group_id?.slice(0,-1) : tab_group_id);	// remove mode_id from tab_group_id
			let tab_group = getTabGroupById(tab_group_id.split('_')[1]) || getTabGroupById(workspace.rootSplit.children[0].id);
			if ( !tab_group || this.app.appId !== tab_group_id.split('_')?.[0] ) 											{ return }
			switch(true) {
				case tab_group.containerEl.classList?.contains(mode) && bool2 !== true:													// toggle compact mode off
					tab_group.containerEl?.classList?.remove('is_compact_mode','is_semi_compact_mode');							break;	// remove compact mode classes
				case tab_group_id && bool2 === true:																					// on startup, add compact mode (initContinuousMode())
				case !tab_group.containerEl.classList.contains(mode):																	// toggle compact mode on
					if ( !tab_group.containerEl.classList.contains('is_continuous_mode') ) { toggleContinuousMode(tab_group_id,true) }	// toggle on continuous mode if necessary
					tab_group.containerEl.classList.remove('is_compact_mode','is_semi_compact_mode');
					tab_group.containerEl.classList.add(mode);																	break;	// toggle compact_mode classes
			}
			toggleContentEditable();
			updateSavedIds(tab_group_id + mode_id,mode,bool2);																			// update saved ids
		},100);
		const toggleContentEditable = obsidian.debounce( () => {
			let active_leaf = workspace.getActiveViewOfType(obsidian.View).leaf || workspace.rootSplit.children[0].children[0], active_leaf_parent = active_leaf.parent.containerEl;
			let active_iframe = active_leaf_parent.querySelectorAll('iframe');
				switch(true) {
					case active_leaf_parent.classList.contains('is_semi_compact_mode'):																// allow active leaf to be edited
								active_leaf_parent.querySelectorAll('[contenteditable]').forEach( el => { el.contentEditable = 'false'; });			// disable editing
								active_leaf.containerEl.querySelectorAll('[contenteditable]').forEach( el => { el.contentEditable = 'true'; });		// enable active note editing
								active_leaf_parent.querySelectorAll('iframe').forEach( el => { el.scrolling = 'no'; });								// prevent iframe scroll (e.g. in html files)
								if ( active_iframe ) { active_iframe.scrolling = 'yes'; }															// enable iframe scroll in active leaf
								workspace.setActiveLeaf(active_leaf,{focus:true});															break;
					case active_leaf_parent.classList.contains('is_compact_mode'):
								active_leaf_parent.querySelectorAll('[contenteditable]').forEach( el => { el.contentEditable = 'false'; });		// disable editing
								active_leaf_parent.querySelectorAll('iframe').forEach( el => { el.scrolling = 'no'; });					break;	// prevent iframe scroll (e.g. in html files)
					default:	active_leaf_parent.querySelectorAll('[contenteditable]')?.forEach( el => { el.contentEditable = 'true' });			// enable editing
								active_leaf_parent.querySelectorAll('iframe').forEach( el => { delete el?.scrolling; });					break;	// enable iframe scrolling
				}
		},100);
		/*-----------------------------------------------*/
		// INITIALIZE CONTINUOUS MODE
		const initContinuousMode = obsidian.debounce( () => {
			addIcons();
			if ( this.settings.tabGroupIds.length > 0 ) {																				// if there are any saved tabGroupIds...
				this.settings.tabGroupIds.forEach( tab_group_id => {																	// for each id...
					if ( this.app.appId === tab_group_id?.split('_')[0] ) {																// if the tabgroup belongs to the current app (window)...
 						toggleContinuousMode(tab_group_id,true);																		// restore continuous mode
					}
				});
			}
			if ( this.settings.compactModeTabGroupIds.length > 0 ) {																	// if there are any saved tabGroupIds...
				this.settings.compactModeTabGroupIds?.forEach( tab_group_id => {														// for each id...
					if ( tab_group_id.startsWith(this.app.appId) ) {																	// if the tabgroup belongs to the current app (window)...
						toggleCompactMode(tab_group_id,tab_group_id.endsWith('+'),true);												// restore compact or semi-compact mode
					}
				});
			}
		},250);
		workspace.onLayoutReady( async () => { initContinuousMode(); });																// initial initialization
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
		/*-----------------------------------------------*/
		// SCROLL ACTIVE ITEMS INTO VIEW
		const scrollRootItems = (target) => {
			if ( this.settings.disableScrollRootItemsIntoView === true ) { return }
			let workspaceTabs = target.closest('.workspace-tabs');
			let activeLeaf = workspaceTabs.querySelector('.workspace-leaf.mod-active') || getActiveLeaf();
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
				case ( /metadata-/.test(el?.className) ):																				// scroll metadata/properties
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
			let type = ( /workspace-tab-header|nav-header|view-header-title-container|nav-buttons-container/.test(target?.className) ? 'leaf' : 'item' );
			let workspaceTabs = target?.closest('.workspace-tabs');
			let workspaceTabsContainer = workspaceTabs?.querySelector('.workspace-tab-container');
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
			let target = ( /body/i.test(e?.target?.tagName) ? workspace.getActiveViewOfType(obsidian.View).containerEl : e?.target || e?.containerEl );
			if ( target === undefined || target.closest('.is_continuous_mode') === null ) { return }										// ignore e.target ancestor is not in continuous mode
			switch(true) {
				case ( target.closest('.mod-sidedock.mod-left-split,.mod-sidedock.mod-right-split') !== null ):	scrollSideBarItems(target);	break;	// scroll sidebar items
				case ( /workspace-tab-header/.test(target.className) ):											scrollRootItems(target);	break;	// scroll leaf into view
				default:							 										scrollTabHeader();	scrollToActiveLine(e);		break;	// scroll active line into view
			}
		},0);
		/*-----------------------------------------------*/
		// ARROW NAVIGATION between open leaves
		const leafArrowNavigation = (e) => { //e.preventDefault();
			let active_leaf = getActiveLeaf(), activeTabGroupChildren = workspace.activeTabGroup.children, active_el = document.activeElement, el = null;
			let active_editor = getActiveEditor(), cursor_anchor = active_editor?.getCursor('anchor');
			let is_compact_mode = isCompactMode();
			let is_semi_compact_mode = active_leaf.parent.containerEl.classList.contains('is_semi_compact_mode');
			let is_last_line = cursor_anchor?.ch === active_editor?.getLine(active_editor?.lastLine()).length && cursor_anchor?.line === ( active_editor?.lineCount() - 1);
			switch(true) {																														// Ignore arrow navigation function in these cases:
				case is_semi_compact_mode && !active_editor && !/ArrowLeft|ArrowRight/.test(e.key):
				case is_semi_compact_mode && is_last_line && e.key === 'ArrowDown':
				case is_semi_compact_mode && cursor_anchor?.ch === 0 && cursor_anchor?.line === 0 && e.key === 'ArrowUp':
				case is_compact_mode && !is_semi_compact_mode: 			compactModeNavigation(e,active_leaf,activeTabGroupChildren);			return;	// use compact mode navigation
				case workspace.leftSplit.containerEl.querySelector('.tree-item-self.nav-file-title.is-selected.has-focus') !== null:
					scrollSideBarItems(workspace.leftSplit.containerEl.querySelector('.tree-item-self.nav-file-title.is-selected.has-focus'));			// scroll focused file explorer item into view
				case !getActiveLeaf()?.containerEl?.closest('.workspace-tabs')?.classList.contains('is_continuous_mode'):								// continuous mode inactive in .workspace-tabs
				case ( /input|textarea/.test(active_el?.tagName?.toLowerCase())):																		// input or textarea
				case getActiveLeaf()?.containerEl?.closest('.mod-root') === null && !getActiveEditor()?.hasFocus():										// not in editor
				case e.target.querySelector('.canvas-node.is-focused') && /Arrow/.test(e.key): 															// editing canvas
				case e.target.querySelector('.workspace-leaf-content[data-set="graph"]') && /Arrow/.test(e.key) && e.shiftKey:					return;	// graph active; use shift key to move graph
			}
			if ( (active_el?.classList.contains('cm-scroller') || !active_editor?.hasFocus()) && !/metadata-/.test(active_el.className) ) { active_editor?.focus(); }
			switch(e.key) {
				case 'ArrowUp': case 'ArrowLeft':
					switch(true) {
 						case ( /outliner-editor-view/.test(active_leaf.getViewState().type) ):													return;
						case ( /metadata-/.test(e.target.className) && !/metadata-properties-head/.test(e.target.className) ):
							scrollToActiveLine(e);																								return;	// select previous metadata item
						case cursor_anchor?.line === 0 && cursor_anchor?.ch > 0 && e.key === 'ArrowUp': e.preventDefault();
							active_editor?.setCursor({line:0,ch:0});																			return;	// set cursor to beginning of editor
						case ( /html/.test(active_leaf.view.getViewType()) && e.key === 'ArrowLeft' ): 													// html left arrow nav page up
							active_leaf.containerEl.querySelector('iframe').focus();
							active_leaf.containerEl.querySelector('iframe').contentWindow.scrollBy({top:-250,left:0,behavior:'smooth'});		break;
						case ( /pdf/.test(active_leaf.view.getViewType() ) ):
							switch(true) {
								case e.key === 'ArrowLeft':												pdfPageNavigation(e);					return;	// pdf page navigation
								case e.key === 'ArrowUp':																								// pdf navigation up arrow to previous leaf
									active_leaf.view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
									active_leaf.view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');		// nobreak
							}																															// nobreak
						case e.target.classList.contains('inline-title') && window.getSelection().anchorOffset === 0:	 								// nobreak; cursor in inline-title
						case e.target.classList.contains('metadata-properties-heading') && e.key === 'ArrowUp':	 										// nobreak; cursor in properties header
						case e.target.classList.contains('metadata-properties-heading') && !active_el.classList.contains('is-collapsed') && e.key === 'ArrowLeft':	// nobreak
						case active_leaf.getViewState().state.mode === 'preview':																		// nobreak; leaf is in preview mode
						case cursor_anchor?.ch === 0 && cursor_anchor?.line === 0 && e.key === 'ArrowUp':												// nobreak; cursor at first line, first char
						case ( !/markdown/.test(active_leaf.getViewState().type) ):																		// nobreak; leaf is empty (new tab)
							if ( active_leaf.containerEl.previousSibling !== null ) {																	// ignore if first leaf
								workspace.setActiveLeaf(activeTabGroupChildren[activeTabGroupChildren.indexOf(active_leaf) - 1],{focus:true});			// make previous leaf active 
								active_editor?.setCursor({line:active_editor.lastLine(),ch:active_editor.lastLine().length - 1});						// select last char
								scrollToActiveLine(e);																							return;	// 
							}
					}																															break;
				case 'ArrowDown':	case 'ArrowRight':
					switch(true) {
 						case ( /outliner-editor-view/.test(active_leaf.getViewState().type) ):													return;
						case ( /metadata-/.test(e.target.className) ): 								scrollToActiveLine(e);						return;
						case ( /html/.test(active_leaf.view.getViewType() ) && e.key === 'ArrowRight' ):												// html page right arrow nav page down
							active_leaf.containerEl.querySelector('iframe').focus();
							active_leaf.containerEl.querySelector('iframe').contentWindow.scrollBy({top:250,left:0,behavior:'smooth'});			break;
						case ( /pdf/.test(active_leaf.view.getViewType() ) ):
							switch(true) {
								case e.key === 'ArrowRight':											pdfPageNavigation(e);					return;	// pdf page navigation
								case e.key === 'ArrowDown':																								// pdf navigation down arrow to next leaf
									active_leaf.view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
									active_leaf.view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');		// nobreak
							}																															// nobreak
						case is_last_line && e.key === 'ArrowDown':
						case active_leaf.getViewState().state.mode === 'preview':																		// leaf is in preview mode
						case ( !/markdown/.test(active_leaf.getViewState().type) ):																		// make next leaf active
							workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(active_leaf) + 1] || active_leaf),{focus:true});
							getActiveEditor()?.setCursor({line:0,ch:0});																				// select first line, first char
							if ( getActiveLeaf().containerEl.querySelector('.metadata-properties-heading') ) { el = getActiveLeaf().containerEl.querySelector('.metadata-properties-heading'); }
																																				break;
					}
			}
			sleep(100).then( () => { scrollToActiveLine(e,el); });
		}
		// COMPACT MODE NAVIGATION
		const compactModeNavigation = obsidian.debounce((e,active_leaf,activeTabGroupChildren) => {
			let incr = ( /Down|Right/.test(e.key) ? 1 : -1 ), index = activeTabGroupChildren.indexOf(active_leaf) + incr;
			let next_leaf = ( activeTabGroupChildren[index] ? activeTabGroupChildren[index] : incr === 1 ? activeTabGroupChildren[0] : activeTabGroupChildren[activeTabGroupChildren.length - 1]);
			delete active_leaf.containerEl.querySelector('iframe')?.scrolling;
			switch(true) {
				case active_leaf.parent.containerEl.classList.contains('is_compact_mode'):
					active_leaf.containerEl.querySelectorAll('[contenteditable]').forEach( el => { el.contentEditable = 'false' });
					workspace.setActiveLeaf(next_leaf,{focus:false}); 
					openInRightSplit(e,workspace.activeLeaf.view.file);																	break;
				case active_leaf.parent.containerEl.classList.contains('is_semi_compact_mode'):
					next_leaf.containerEl.querySelectorAll('[contenteditable]')?.forEach( el => { el.contentEditable = 'true' });				// enable editing in active leaf
					if ( next_leaf.containerEl.querySelector('iframe') ) { next_leaf.containerEl.querySelector('iframe').scrolling = 'yes'; }	// enable iframe scroll in active leaf
			}
			activeTabGroupChildren.forEach( leaf => leaf.view.editor?.scrollTo({top:0}) );																// scroll editors to top
			workspace.setActiveLeaf(next_leaf,{focus:true});
			scrollItemsIntoView(e);
		},100)
		// PDF PAGE NAVIGATION
		const pdfPageNavigation = (e) => {
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
			getActiveLeaf().containerEl?.querySelector('.pdf-container')?.scrollTo({left:0,top:scroll_top,behavior:'smooth'});
			getActiveLeaf().view.viewer?.containerEl?.querySelector('.pdf-toobar')?.click();	// needed to focus pdf viewer and enable proper page navigation by arrow keys
		}
		/*-----------------------------------------------*/
		// OPEN ITEMS IN CONTINUOUS MODE getAllTabGroups
		const openItemsInContinuousMode = (items,action,type) => {
			if ( !items ) { return }
			let active_leaf, new_leaf, recent_leaf = workspace.getMostRecentLeaf(), direction, bool, empty = false; 
			let open_files = [], open_leaves = [], included_extensions = [];
			recent_leaf?.parent?.children?.forEach( child => { open_files.push(child?.view?.file); open_leaves.push(child) });			// get open files in active tab group
			let appended_leaf = ( items.length === 1 ? open_leaves.find( open_leaf => items[0] === open_leaf.view.file ) : null );
			let extensions = { 
				markdown:	['md'],
				images:		['avif','bmp','jpg','jpeg','gif','png','svg','webp'],
				canvas:		['canvas'],
				media:		['aac','aif','aiff','ape','flac','m4a','mka','mp3','ogg','opus','wav','m4v','mkv','mov','mp4','mpeg','webm'],
				pdf:		['pdf']
			};
			for (const [key, value] of Object.entries(extensions)) { if ( this.settings.includedFileTypes.includes(key) ) { included_extensions.push(value); } }	// get included extensions
			included_extensions = included_extensions.concat(this.settings.extraFileTypes).flat(Infinity).map( ext => ext.trim() );					// add extra file types, trim, and flatten
			open_files = open_files.filter( file => typeof file !== 'undefined' );
			items = items.filter( 
					item => item instanceof obsidian.TFile 																							// item must be TFile
					&& included_extensions.includes( item.extension ) 																				// remove items included by extension
					&& !this.settings.excludedNames.includes( item.basename +'.'+ item.extension )													// remove items excluded by name
			);
			// warnings:
			switch(true) {
				case (/replace/.test(action)) && this.settings.disableWarnings !== true 
					&& !window.confirm('You are about to replace all items in the active split. Are you sure you want to do this?'):		return;	// confirm replace open notes
				case items.length > 99 && !window.confirm('You are about to open '+ items.length +'. Are you sure you want to do this?'):	return;	// warn on opening > 99 notes
				case items.length === 0:  		return alert(type === 'document links' ? 'No document links found.' : 'No readable files found.');	// alert no items found
			}
			switch(true) {
				case ( /replace/i.test(action) ):																					// close all leaves in active tab group only
					workspace.setActiveLeaf(recent_leaf,{focus:true});
					workspace.activeTabGroup.children.forEach( child => {
						sleep(50).then( () => { child.setPinned(false); child.detach(); });
					});																										break;
				case ( /append/.test(action) ):																						// append folder items to active tab group
					if ( type === 'file' ) {
						open_leaves.forEach( leaf => { if ( leaf.getViewState().type === 'empty') { sleep(50).then( () => leaf.detach() )} });								// remove empty leaf
						findDuplicateLeaves(open_leaves).forEach( leaf => sleep(50).then( () => { workspace.getLeafById(leaf.id)?.detach(); }) );	// close dupe notes
					}
					items = items.filter( item => !open_files.includes(item) );														// no dupe notes
					workspace.iterateAllLeaves( child => { sleep(10).then( () => { child.setPinned(false); }); });
					switch(true) {
						case ( /append_compact/.test(action) ):
							workspace.setActiveLeaf(workspace.rootSplit.children[0].children[0],{focus:true});	break;				// set active leaf
						case ( /append/.test(action) ):
							if ( /compact/.test(workspace.activeTabGroup.containerEl.className) ) { workspace.activeTabGroup.containerEl.classList.remove('is_compact_mode','is_semi_compact_mode'); }
							break;
						default:
							workspace.setActiveLeaf(appended_leaf,{focus:true}); 													// set single appended leaf to active
							scrollRootItems(appended_leaf.containerEl);																// scroll single appended leaf into view
																break;
					}																										break;
				default:																											// open items in new splits L/R/U/D
					if ( isCompactMode() ) {
						setFirstLeafInRightSplitActive(workspace.rootSplit.children[1]);											// prevent use of compact mode left root split
						recent_leaf = workspace.getActiveViewOfType(obsidian.View).leaf;
					}
					switch(true) {
						case (/down/.test(action)):							direction = 'horizontal';	bool = false; 		break;
						case (/up/.test(action)):							direction = 'horizontal';	bool = true;		break;
						case (/left/.test(action)):							direction = 'vertical';		bool = true;		break;
						case (/right/.test(action)):						direction = 'vertical';		bool = false;		break;
					}
					new_leaf = workspace.createLeafBySplit(recent_leaf,direction,bool);
					workspace.setActiveLeaf(workspace.getLeafById(new_leaf.id),{focus:true});
					active_leaf = new_leaf;
			}
			// sort items:
			let sort_order = (																														// get sort order
				/query block links|document links|longform/i.test(type) ? 'none' 																	// open doc links, etc. in their listed order
				: /search/.test(type) ? workspace.getLeavesOfType('search')[0].view.dom.sortOrder													// open search results in search order
				: this.settings.defaultSortOrder !== undefined && this.settings.defaultSortOrder !== 'disabled' ? this.settings.defaultSortOrder	// use default sort order from settings
				: type === undefined ? 'alphabetical' 
				: workspace.getLeavesOfType('file-explorer')[0].view.sortOrder 
			);
			switch(sort_order) {
				case 'alphabetical':			items.sort((a,b) => (a.basename).localeCompare(b.basename,navigator.language,{sensitivity:'base',numeric:true}));	break;
				case 'alphabeticalReverse':		items.sort((a,b) => (b.basename).localeCompare(a.basename,navigator.language,{sensitivity:'base',numeric:true}));	break;
				case 'byModifiedTime':			items.sort((a,b) => b?.stat.mtime - a?.stat.mtime);																	break;
				case 'byModifiedTimeReverse':	items.sort((a,b) => a?.stat.mtime - b?.stat.mtime);																	break;
				case 'byCreatedTime':			items.sort((a,b) => b?.stat.ctime - a?.stat.ctime);																	break;
				case 'byCreatedTimeReverse':	items.sort((a,b) => a?.stat.ctime - b?.stat.ctime);																	break;
				case 'none':																																		break;	// no sort
			}
			// open sorted items:
			let maximumItemsToOpen = ( this.settings.maximumItemsToOpen < 1 || this.settings.maximumItemsToOpen === undefined ? Infinity : this.settings.maximumItemsToOpen );
			for ( let i = 0; i < maximumItemsToOpen && i < items.length; i++ ) {										// limit number of items to open
				active_leaf = workspace.getLeaf();																		// open new tab/leaf
				active_leaf.openFile(items[i]);																		// open file
				active_leaf.setPinned(true);																			// pin each new tab/leaf to stop Obsidian reusing it to open next file in loop
			}
			workspace.activeTabGroup.containerEl.dataset.sort_order = sort_order;										// set data-sort_order
			sleep(50).then( () => {
				if ( !isContinuousMode() )							{ toggleContinuousMode(this.app.appId +'_'+ active_leaf?.parent?.id,true); }
				if ( !isCompactMode() && /compact/.test(action) )	{ toggleCompactMode( this.app.appId +'_'+ workspace.rootSplit.children[0].children[0].id,/semi/.test(action),true) }
				if ( recent_leaf !== workspace.getMostRecentLeaf() && !/append/.test(action) ) { 
					recent_leaf?.parent?.children[recent_leaf.parent.children.indexOf(recent_leaf) + 1]?.detach();		// close default opened file
				}
				if ( recent_leaf === workspace.getMostRecentLeaf() && /append/.test(action) && recent_leaf.getViewState().type === 'empty' ) { 
					recent_leaf.detach();
				}
				if ( /append|replace/.test(action) ) {
					sleep(100).then( () => {
						/compact/.test(action) ? workspace.rootSplit.children[0].children[0].containerEl?.click() : appended_leaf?.containerEl?.click();	// click leaf
					});
				}
				resetPinnedLeaves(); 																					// reset pinned status
			});
		 }
		 // end openItemsInContinuousMode
		/*-----------------------------------------------*/
		const setFirstLeafInRightSplitActive = (split) => {
			let bool = ( !workspace.rootSplit.children[1] ? false : true );
			let source_split = split || workspace.rootSplit.children[1] || workspace.createLeafBySplit(workspace.rootSplit,'vertical',true);
			switch(true) {
				case source_split?.type === 'tabs':		workspace.setActiveLeaf(source_split.children[0],{focus:true});		break;
				case source_split?.type === 'split':	setFirstLeafInRightSplitActive(source_split.children[0]);			break;	// recurse through splits until a tabs container is reached
			}
			if ( !bool ) { workspace.setActiveLeaf(source_split,{focus:true}); }													// focus empty tab in right split
		}
		const openInRightSplit = (e,file) => {
			setFirstLeafInRightSplitActive();
			let active_split = workspace.getLeaf();																		// open new tab/leaf
 			active_split.openFile(file);																				// open file
		 }
		/*-----------------------------------------------*/
		 // Sort Items
		 const sortItems = async (tab_group_id,sort_order) => {
		 	let active_tab_group = getTabGroupById(tab_group_id?.split('_')[1]);
		 	let items = active_tab_group.children, sorted = [], pinned_leaves = [], active_split;
		 	if ( items === null ) { return }
			switch(sort_order) {																						// sort files
				case 'alphabetical':			sorted = items.toSorted(
													(a,b) => (a?.view.file?.basename || '').localeCompare(b?.view.file?.basename || '',navigator.language,{sensitivity:'base',numeric:true}));	break;
				case 'alphabeticalReverse':		sorted = items.toSorted(
													(a,b) => (b?.view.file?.basename || '').localeCompare(a?.view.file?.basename || '',navigator.language,{sensitivity:'base',numeric:true}));	break;
				case 'byModifiedTime':			sorted = items.toSorted((a,b) => b?.view.file?.stat?.mtime - a?.view.file?.stat?.mtime);						break;
				case 'byModifiedTimeReverse':	sorted = items.toSorted((a,b) => a?.view.file?.stat?.mtime - b?.view.file?.stat?.mtime);						break;
				case 'byCreatedTime':			sorted = items.toSorted((a,b) => b?.view.file?.stat?.ctime - a?.view.file?.stat?.ctime);						break;
				case 'byCreatedTimeReverse':	sorted = items.toSorted((a,b) => a?.view.file?.stat?.ctime - b?.view.file?.stat?.ctime);						break;
			}
			workspace.iterateAllLeaves( leaf => { if ( leaf.pinned === true ) { pinned_leaves.push(leaf.id) } else { leaf.setPinned(true) } }); // pin all currently open tabs; remember pin status
			workspace.setActiveLeaf(active_tab_group.children[0],{focus:true});
			active_tab_group.children.forEach( child => { 
				sleep(0).then( () => { child.setPinned(false);	child.detach(); });										// unpin and close all leaves in active tab group
			});
			sorted.forEach( item => {																					// open the files
				active_split = workspace.getLeaf();																		// open new tab/leaf
				active_split.openFile(item.view.file);																	// open file
				active_split.setPinned(true);																			// pin new tab/leaf to prevent Obsidian reusing it to open next file in loop
			});
			workspace.iterateAllLeaves( leaf => { if ( !pinned_leaves.includes(leaf.id) ) { leaf.setPinned(false); } });	// unpin all tabs, except for originally pinned tabs
			active_tab_group.containerEl.dataset.sort_order = sort_order;												// set data-sort_order
		 };
		/*-----------------------------------------------*/
		// REGISTER DOM EVENTS
		this.registerDomEvent(window,'click', (e) => {
			let compact_mode_group = workspace.activeTabGroup?.children?.find(child => child?.tabHeaderEl?.className?.includes('is-active')) || workspace.rootSplit.children[0];
			let action = this.settings.allowSingleClickOpenFolderAction, path = '', items = null, active_leaf, active_compact_leaf;
			switch(true) {
				case e.target.className.includes('metadata-'):																							break;
				case e.target.classList.contains('continuous_mode_open_links_button'):																			// nobreak
				case e.target.closest('.continuous_mode_open_links_button') !== null:												showLinksMenu(e);	break;	// open links in continuous mode
				case e.target.closest('.workspace-tabs.is_compact_mode') !== null 														// compact mode: open in right split on tab click
					&& e.target.closest('.workspace-tab-header-new-tab') === null && e.target.closest('.workspace-tab-header-tab-list') === null:
						active_compact_leaf = workspace.getActiveViewOfType(obsidian.View)?.leaf;
						if ( active_compact_leaf.parent.containerEl.classList.contains('is_compact_mode') ) {  openInRightSplit(e,active_compact_leaf?.view?.file); }
						scrollItemsIntoView(e);
						workspace.setActiveLeaf(active_compact_leaf,{focus:true})
					break;
				case ( e.target.closest('.nav-file.tree-item') !== null && this.settings.allowSingleClickOpenFolder === true ) 			// open file explorer files on single click
					&& !e.altKey && !e.ctrlKey && !e.shiftKey && e.button !== 2
					&& action !== 'disabled':
					sleep(0).then( () => {
						path = e.target.closest('.nav-file-title').dataset.path, items = this.app.vault.getFileByPath(path);
						openItemsInContinuousMode([items],action,'file'); 
					});																																	break;
				case ( e.target.closest('.nav-folder.tree-item') !== null && this.settings.allowSingleClickOpenFolder === true )  		// open file explorer folders on single click
					&& e.target.closest('.nav-folder-collapse-indicator') === null && e.target.closest('.collapse-icon') === null
					&& !e.altKey && !e.ctrlKey && !e.shiftKey && e.button !== 2
					&& action !== 'disabled':
					sleep(0).then( () => {
						path = e.target.closest('.nav-folder-title')?.dataset?.path, items = this.app.vault.getFolderByPath(path)?.children;
						openItemsInContinuousMode(items,action,'folder');
					});																																	break;
				case e.target.classList.contains('menu-item-title'):																							// focus tab and scroll into view
					sleep(0).then( () => {
						active_leaf = workspace.activeTabGroup.children.find(child => child.tabHeaderEl.className.includes('is-active'));
						workspace.setActiveLeaf(active_leaf,{focus:true}); 
					});																																			// nobreak
				case ( e.target.closest('.workspace-leaf')?.classList.contains('mod-active') && e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode') ):
				case ( /workspace-tab-header|nav-header|view-header-title-container/.test(e.target.className) && workspace.activeTabGroup.containerEl.classList.contains('is_continuous_mode') ):
					workspace.setActiveLeaf(getActiveLeaf(),{focus:true});	
					scrollItemsIntoView(e);																												break;	// click tab, scroll into view
			}
		});
		this.registerDomEvent(window,'mousedown', (e) => {
			switch(true) {
				case ( e.target.closest('.nav-file.tree-item') !== null 
					&& this.settings.allowSingleClickOpenFolder === true ) 
					&& !e.altKey && !e.ctrlKey && !e.shiftKey && e.button !== 2:																		break;
				case e.target.closest('.workspace-tabs.is_compact_mode') !== null 
					&& e.target.closest('.workspace-tab-header-new-tab') === null && e.target.closest('.workspace-tab-header-tab-list') === null:		break;
				case (e.buttons === 2 || e.ctrlKey) && e.target.closest('.longform-explorer') !== null:		getLongformItems(e);						break;	// show longform menu
			}
		});
		this.registerDomEvent(document,'mouseup', (e) => {
			const testStr = /open or append .+ in active tab group|replace active tab group|open .+ in new split|compact mode:/i;
			switch(true) {
				case ( /Toggle Compact Mode/.test(e.target.innerText) ):																						// from Tab Group Menu
				case this.settings.allowSingleClickOpenFolder === false:
				case e.altKey || e.ctrlKey || e.shiftKey || e.button === 2:																				break;	// do nothing
				case ( e.target.classList.contains('menu-item-title') && testStr.test(e.target.innerText) ):													// nobreak; CM menu items
				case ( e.target.closest('.nav-file.tree-item') !== null ):																						// nobreak; file explorer files
 				case ( e.target.closest('.nav-folder.tree-item') !== null																						// file explorer folders
 					&& e.target.closest('.nav-folder-collapse-indicator') === null && e.target.closest('.collapse-icon') === null ): 
						workspace.iterateAllLeaves( leaf => {
							if ( leaf.pinned !== true ) { 
								leaf.setPinned(true); leaf.containerEl.classList.add('temp_pinned'); leaf.tabHeaderEl.classList.add('temp_pinned');				// pin all unpinned leaves, add class
							} else {
								leaf.containerEl.classList.add('pinned');																						// mark originally pinned leaves
							}
						});																																break;
			}
		});
		this.registerDomEvent(window,'mouseover', (e) => {
			let continuous_mode_open_links_button, button_container_el;
			switch(true) {
				case e.target.closest('.markdown-reading-view,.markdown-preview-view') !== null:																// show button in reading view
					switch(true) {
						case e.target.closest('.block-language-dataview') !== null:
							button_container_el = e.target.closest('.block-language-dataview');															break;
						case e.target.closest('.internal-query') !== null:
							button_container_el = e.target.closest('.internal-query')?.querySelector('.internal-query-header');							break;
					}																																	break;
				case e.target.closest('.markdown-source-view') !== null:																						// show button in edit view
					switch(true) {
						case e.target.closest('.cm-preview-code-block')?.querySelector('.internal-query-header') !== null:
							button_container_el = e.target.closest('.cm-preview-code-block')?.querySelector('.internal-query-header');					break;
						case e.target.closest('.cm-preview-code-block')?.querySelector('.internal-query-header') === null:
							button_container_el = e.target.closest('.cm-preview-code-block');															break;
					}																																	break;
			}
			if ( button_container_el?.querySelector('.continuous_mode_open_links_button') === null ) {															// add open links button if needed
				continuous_mode_open_links_button = button_container_el?.createEl('div',{cls:'continuous_mode_open_links_button clickable-icon'});
				continuous_mode_open_links_button.setAttribute('aria-label','Continuous Mode');
				continuous_mode_open_links_button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>';
			}
		});
		this.registerDomEvent(window,'keydown', (e) => {
			if ( /Arrow/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ) {
				leafArrowNavigation(e);
			}
		});	
		this.registerDomEvent(window,'dragstart', (e) => {
			if ( !e.target.closest('.workspace-tabs')?.classList.contains('is_continuous_mode')) { return; }
			if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }					// get initial tab header index for onTabHeaderDragEnd()
		});
		/*-----------------------------------------------*/
		// ADD CONTEXTUAL MENU ITEMS
		const addContinuousModeMenuItem = (item, tab_group_id, leaf) => {																// add continuous mode menu items (toggle, headers, sort)
			let tab_group = getTabGroupById(tab_group_id?.split('_')[1]), tab_group_el = tab_group?.containerEl, tab_group_classList = tab_group_el?.classList;
			item.setTitle('Continuous Mode')
				.setIcon('scroll-text')
				.setSection( leaf ? 'pane' : 'action' )
				.setSubmenu().addItem((item2) => {
					item2.setTitle('Toggle Continuous Mode')
					.setIcon('scroll-text')
					.setChecked( tab_group_classList?.contains('is_continuous_mode') ? true : false )
					.onClick(async () => { 
						toggleContinuousMode(tab_group_id || this.app.appId +'_'+ workspace.activeTabGroup.id,( tab_group_classList?.contains('is_continuous_mode') ? false : true ));
					})
				})
				.addSeparator()
				.addItem((item12) => {
					if ( tab_group === workspace.rootSplit.children[0] ) {
						item12.setTitle('Toggle Compact Mode')
						.setIcon('compactMode')
						// .setDisabled( tab_group_classList.contains('is_continuous_mode') ? false : true )
						.setChecked( tab_group_classList?.contains('is_compact_mode') ? true : false )
						.onClick(async () => {
							toggleCompactMode(tab_group_id,false,( tab_group_classList?.contains('is_compact_mode') ? false : true ));
						})
					}
				})
				.addItem((item12) => {
					if ( tab_group === workspace.rootSplit.children[0] ) {
						item12.setTitle('Toggle Semi-Compact Mode')
						.setIcon('semiCompactMode')
						// .setDisabled( tab_group_classList.contains('is_continuous_mode') ? false : true )
						.setChecked( tab_group_classList?.contains('is_semi_compact_mode') ? true : false )
						.onClick(async () => {
							toggleCompactMode(tab_group_id,true,( tab_group_classList?.contains('is_semi_compact_mode') ? false : true ));
						})
					}
				})
				.addSeparator()
				.addItem((item3) => {
					item3.setTitle( tab_group_classList?.contains('hide_note_titles') ? 'Show note headers' : 'Hide note headers' )
					.setIcon('panelTopDashed')
					.setDisabled( tab_group_classList?.contains('is_continuous_mode') ? false : true )
					// .setChecked( tab_group_classList?.contains('hide_note_titles') ? true : false )
					.onClick(async () => {
						if ( workspace.activeTabGroup?.containerEl?.classList?.contains('hide_note_titles') ) {
							workspace.activeTabGroup?.containerEl?.classList?.remove('hide_note_titles');
							workspace.activeTabGroup?.containerEl?.classList?.add('show_note_titles');
						} else {
							workspace.activeTabGroup?.containerEl?.classList?.remove('show_note_titles');
							workspace.activeTabGroup?.containerEl?.classList?.add('hide_note_titles');
						}
					})
				})
				.addItem((item4) => {
					item4.setTitle('Change sort order')
						.setIcon('arrow-up-narrow-wide')
						.setDisabled( tab_group?.children?.length > 1 && tab_group_classList?.contains('is_continuous_mode') ? false : true )
						.setSubmenu()
							.addItem((item5) => {
							item5.setTitle('File name (A to Z)')
								.setChecked( tab_group_el?.dataset?.sort_order === 'alphabetical' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'alphabetical');
								})
							})
							.addItem((item6) => {
								item6.setTitle('File name (Z to A)')
								.setChecked( tab_group_el?.dataset?.sort_order === 'alphabeticalReverse' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'alphabeticalReverse');
								})
							})
							.addSeparator()
							.addItem((item7) => {
								item7.setTitle('Modified time (new to old)')
								.setChecked( tab_group_el?.dataset?.sort_order === 'byModifiedTime' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byModifiedTime');
								})
							})
							.addItem((item8) => {
								item8.setTitle('Modified time (old to new)')
								.setChecked( tab_group_el?.dataset?.sort_order === 'byModifiedTimeReverse' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byModifiedTimeReverse');
								})
							})
							.addSeparator()
							.addItem((item9) => {
								item9.setTitle('Created time (new to old)')
								.setChecked( tab_group_el?.dataset?.sort_order === 'byCreatedTime' ? true : false )
								.onClick(async () => { 
									sortItems(tab_group_id,'byCreatedTime');
								})
							})
							.addItem((item10) => {
								item10.setTitle('Created time (old to new)')
								.setChecked( tab_group_el?.dataset?.sort_order === 'byCreatedTimeReverse' ? true : false )
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
					.addItem((item6) => {
						item6.setTitle('Open or append '+type+' in active tab group')
						.setIcon('appendFolder')
						.onClick(async () => { 
						openItemsInContinuousMode(file,'append',type); })
					})
					.addItem((item7) => {
						item7.setTitle('Replace active tab group with '+type)
						.setIcon('replaceFolder')
						.onClick(async () => { 
						openItemsInContinuousMode(file,'replace',type) })
					})
					.addSeparator()
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
					.addItem((item8) => {
						item8.setTitle('Open or append '+type+' in Compact Mode')
						.setIcon('compactMode')
						.onClick(async () => { openItemsInContinuousMode(file,'append_compact_mode',type) })
					})
					.addItem((item8) => {
						item8.setTitle('Replace Compact Mode with '+type)
						.setIcon('compactMode')
						.onClick(async () => {
							if ( this.settings.disableWarnings === false && window.confirm('Warning: This will close all open notes in the active tab group. Are you sure you want to do this?') ) {
								openItemsInContinuousMode(file,'replace_compact_mode',type) 
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
		/*-----------------------------------------------*/
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
		/*-----------------------------------------------*/
		// CONTEXT MENU EVENTS
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu,editor) => {																							// on editor-menu
				if ( !!editor.containerEl.querySelectorAll('.cm-active .cm-link, .cm-active .cm-hmd-internal-link, .cm-active .cm-link-alias') ) {	// prevent adding CM menus twice
					menu.addItem((item) => { 
						let links = getDocumentLinks(editor.editorComponent.view.file,editor.editorComponent.view.leaf), files = getFilesFromLinks(links);
						addContinuousModeMenuItem(item,this.app.appId +'_'+ editor?.editorComponent.owner.leaf.parent.id)								// add continuous mode items
						if ( links.length > 0 ) { openItemsInContinuousModeMenuItems(item,files,'document links'); }										// add open document links items
					});
				}
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
							addContinuousModeMenuItem(item,this.app.appId +'_'+ leaf.parent.id, leaf, links)			// add continuous mode items
							if ( links.length > 0 && leaf.containerEl.closest('.mod-sidedock') === null ) {
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
				if ( leaf !== workspace.getActiveViewOfType(obsidian.View).leaf ) { workspace.setActiveLeaf(leaf,{focus:true}); }
				if ( leaf.containerEl.closest('.mod-left-split,.mod-right-split') ) {
					menu.addItem((item) => { addContinuousModeMenuItem(item,this.app.appId +'_'+ leaf.parent.id ) });
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on('tab-group-menu', (menu,tab_group) => {																				// on tab-group-menu
				menu.addItem((item) => { addContinuousModeMenuItem(item,this.app.appId +'_'+ tab_group.id ) });
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
			//	initContinuousMode();
			})
		);
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				toggleContentEditable();
				updateSavedIds();
			})
		);
		/*-----------------------------------------------*/
		// ADD COMMAND PALETTE ITEMS
		
		['active','left','right'].forEach( side => {													// add commands: toggle continuous mode in active tab group, left/right sidebars
			this.addCommand({
				id: 	( side === 'active' ? 'toggle-continuous-mode-active' : 'toggle-continuous-mode-in-'+side+'-sidebar' ),
				name:	( side === 'active' ? 'Toggle Continuous Mode in active tab group' : 'Toggle Continuous Mode in '+side+' sidebar' ),
				callback: () => {
					switch(side) {
						case 'left':	workspace.leftSplit.containerEl.querySelectorAll('.workspace-tabs').forEach( tab_group => toggleContinuousMode(this.app.appId +'_'+ tab_group.id) );	break;
						case 'right':	workspace.rightSplit.containerEl.querySelectorAll('.workspace-tabs').forEach( tab_group => toggleContinuousMode(this.app.appId +'_'+ tab_group.id) );	break;
						default: 		toggleContinuousMode(this.app.appId +'_'+ workspace.activeTabGroup.id);
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
		this.addCommand({																				// add command: toggle compact mode
			id: 	( 'toggle-compact-mode'),
			name:	( 'Toggle compact mode' ),
			callback: () => { toggleCompactMode(this.app.appId +'_'+ workspace.rootSplit?.children[0]?.id,false) }
		});
		this.addCommand({																				// add command: toggle semi-compact mode
			id: 	( 'toggle-semi-compact-mode'),
			name:	( 'Toggle semi-compact mode' ),
			callback: () => { toggleCompactMode(this.app.appId +'_'+ workspace.rootSplit?.children[0]?.id,true) }
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
/////////////////////////////////////////
							case type === 'document links': items = getFilesFromLinks(getDocumentLinks(workspace.getActiveViewOfType(obsidian.View).leaf.view.file,workspace.getActiveViewOfType(obsidian.View).leaf));	break;
//							case type === 'document links': items = getFilesFromLinks(getDocumentLinks(getActiveLeaf().view.file,getActiveLeaf()));	break;
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
						sortItems(this.app.appId +'_'+ workspace.activeTabGroup.id,key);
					} else {
						alert('Active tab group is not in continuous mode.');
					}
				}
			});
		});
		this.addCommand({
			id: 'compact-mode-open-selected-note-in-right-split',
			name: 'Compact Mode: Open selected note in right split',
			callback: () => {
			}
		});

    } 
    // end onload
	/*-----------------------------------------------*/
    // on plugin unload
	onunload() {
		let tab_groups = this.app.workspace.containerEl.querySelectorAll('.workspace-tabs');
		tab_groups.forEach( 
			el => {
				el?.classList?.remove('is_continuous_mode','hide_note_titles','is_compact_mode','is_semi_compact_mode','only_show_file_name');
				delete el?.dataset?.sort_order; 
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
    async saveSettings() { await this.saveData(this.settings); }
} // end class ContinuousModePlugin
/*-----------------------------------------------*/
// SETTINGS
let ContinuousModeSettings = class extends obsidian.PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	display() {
		const { containerEl } = this;
		containerEl.empty();
        containerEl.createEl("h1", {}, (el) => {el.innerHTML = 'Continuous Mode'; });
		new obsidian.Setting(containerEl).setName('Always open new splits in Continuous Mode').setDesc('')
			.addToggle( A => A.setValue(this.plugin.settings.alwaysOpenInContinuousMode)
			.onChange(async (value) => {
				this.plugin.settings.alwaysOpenInContinuousMode = value;
				await this.plugin.saveSettings();
		}));
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
			.addToggle( A => A.setValue(this.plugin.settings.includeEmbeddedFiles)
			.onChange(async (value) => {
				this.plugin.settings.includeEmbeddedFiles = value;
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
        new obsidian.Setting(containerEl).setName('Allow single click to open File Explorer items in Continuous Mode').setDesc('Enable this setting to make it possible to open the items in the File Explorer with a single click. Set the default single click action below.')
        	.addToggle( (A) => A.setValue(this.plugin.settings.allowSingleClickOpenFolder)
        	.onChange(async (value) => {
        		this.plugin.settings.allowSingleClickOpenFolder = value;
        		await this.plugin.saveSettings();
        }));
		new obsidian.Setting(containerEl).setName('Set default single-click action:').setClass("cm-setting-indent")
			.addDropdown((dropDown) => {
				dropDown.addOption("disabled", "—");
				dropDown.addOption("append", "Append file explorer items in active tab group");
				dropDown.addOption("replace", "Replace active tab group with file explorer items");
				dropDown.addOption("open_left", "Open file explorer items in new split left");
				dropDown.addOption("open_right", "Open file explorer items in new split right");
				dropDown.addOption("open_up", "Open file explorer items in new split up");
				dropDown.addOption("open_down", "Open file explorer items in new split down");
				dropDown.addOption("append_compact_mode", "Compact Mode: Append file explorer items in left split");
				dropDown.addOption("replace_compact_mode", "Compact Mode: Replace left split with file explorer items");
				dropDown.addOption("append_compact_mode_semi", "Semi-compact Mode: Append file explorer items in left split");
				dropDown.addOption("replace_compact_mode_semi", "Semi-compact Mode: Replace left split with file explorer items");
				dropDown.setValue( ( this.plugin.settings.allowSingleClickOpenFolderAction === undefined || this.plugin.settings.allowSingleClickOpenFolder === false ? 'disabled' : this.plugin.settings.allowSingleClickOpenFolderAction ) )
				dropDown.onChange(async (value) => {
					this.plugin.settings.allowSingleClickOpenFolderAction = value;
					if ( value !== 'disabled' ) { this.plugin.settings.allowSingleClickOpenFolder = true; }
					await this.plugin.saveSettings();
		  });
		});
        this.containerEl.createEl("h2", { text: 'About Compact Mode and Semi-Compact Mode' });
        this.containerEl.createEl("div", {text: 'Compact and Semi-Compact Mode show previews of your notes in the left split, similar to the second side-pane previews in apps like Evernote, Bear Notes, Simplenote, Apple Notes, etc. Notes can be navigated up and down with the arrow keys as in Continuous Mode, but in Compact Mode, the selected note will be opened in the right split; in Semi-Compact Mode, the selected note will be expanded in place for editing, leaving the other notes in compact view.', cls: 'setting-item-description' });
        this.containerEl.createEl("div", {text: 'Note: You may wish to disable the Obsidian editor setting “Always focus new tabs” to allow continuous arrow navigation of Compact Mode items.', cls: 'setting-item-description' });
        this.containerEl.createEl("h2", { text: "Other Settings" });
		new obsidian.Setting(containerEl).setName('Always hide note headers').setDesc('Never show the note header when opening items in Continuous Mode.')
			.addToggle( A => A.setValue(this.plugin.settings.alwaysHideNoteHeaders)
			.onChange(async (value) => {
				let tab_groups = this.app.workspace.rootSplit.containerEl.querySelectorAll('.workspace-tabs.is_continuous_mode');
				if ( value === true ) {
					tab_groups?.forEach( tab_group => tab_group.classList?.add('hide_note_titles') )
				} else {
					tab_groups?.forEach( tab_group => tab_group.classList?.remove('hide_note_titles') )
				}
				this.plugin.settings.alwaysHideNoteHeaders = value;
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Only show file name in note headers').setDesc('')
			.addToggle( A => A.setValue(this.plugin.settings.onlyShowFileName)
			.onChange(async (value) => {
				let tab_groups = this.app.workspace.rootSplit.containerEl.querySelectorAll('.workspace-tabs.is_continuous_mode');
				if ( value === true ) {
					tab_groups?.forEach( tab_group => tab_group.classList?.add('only_show_file_name') )
				} else {
					tab_groups?.forEach( tab_group => tab_group.classList?.remove('only_show_file_name') )
				}
				this.plugin.settings.onlyShowFileName = value;
				await this.plugin.saveSettings();
		}));
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
		new obsidian.Setting(containerEl).setName('Disable warnings').setDesc('Don’t warn when replacing active tab group with folder contents or opening in compact view.')
			.addToggle( A => A.setValue(this.plugin.settings.disableWarnings)
			.onChange(async (value) => {
				this.plugin.settings.disableWarnings = value;
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
