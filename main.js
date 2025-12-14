/* eslint-disable no-fallthrough */
/* jshint esversion: 6 */

'use strict';

let obsidian = require('obsidian');

let DEFAULT_SETTINGS = {
	'allowSingleClickOpenFolder': 		false,
	'allowSingleClickOpenFolderAction':	'disabled',
	'alwaysHideNoteHeaders':			false,
	'defaultSortOrder':					'alphabetical',
//	'disableScrollRootItemsIntoView':	false,
	'disableWarnings':					false,
	'enableScrollIntoView':				true,
	'enableSmoothScroll':				true,
	'enableTypewriterScroll':			true,
	'excludedNames':					[],
	'extraFileTypes':					[],
	'includeBlockLinks':				false,
	'includeEmbeddedFiles':				false,
	'includedFileTypes':				['markdown'],
	'indexFilesAtTop':					true,
	"maximumItemsToOpen":				'0',
	'navigateInPlace':					false,
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
		const getAllTabGroups = (split) => {
			let tab_groups = [];
			this.app.workspace.iterateAllLeaves(
				leaf => {
					switch(true) {
						case leaf.parent.type !== 'tabs':																			break;
						case (/root/i.test(split)) && leaf.getRoot() !== workspace.rootSplit:												// get root tab groups only
						case (/left/i.test(split)) && leaf.getRoot() !== workspace.leftSplit:												// get root tab groups only
						case (/right/i.test(split)) && leaf.getRoot() !== workspace.rightSplit:										break;	// get root tab groups only
						case (/root/i.test(split)) && leaf.getRoot() === workspace.rootSplit:												// get root tab groups only
						case (/left/i.test(split)) && leaf.getRoot() === workspace.leftSplit:												// get root tab groups only
						case (/right/i.test(split)) && leaf.getRoot() === workspace.rightSplit:		tab_groups.push(leaf.parent);	break;	// get root tab groups only
						default:																	tab_groups.push(leaf.parent);	break;	// get all tab groups
					} 
				}
			)
			return [...new Set(tab_groups)];
		}
		const getTabGroupById = (id) =>		{ return getAllTabGroups()?.find( tab_group => tab_group.id === id ); }			// get tab group by id, not dataset-tab-group-id
		const getTabHeaderIndex = (e) =>	{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
		const getActiveLeaf = () =>			{ return workspace.activeTabGroup.children?.find( child => child.tabHeaderEl?.className?.includes('active')) ?? workspace.activeTabGroup.children?.[0]; }
		const getLeafByFile = (file) =>		{ 
			let found;
			workspace.iterateRootLeaves( leaf => { if (leaf.view.file === file) { found = leaf } }) 
			return found;
		}
		const getActiveEditor = () =>		{ return workspace.activeEditor?.editor; }
		const getActiveCursor = () =>		{ return getActiveEditor()?.getCursor('anchor'); }
		const getAnchorOffset = () =>		{ return document.getSelection().anchorOffset; }
		const getSelection = () =>			{ return document.getSelection(); }
		const selectAll = (el) => {
			let sel = document.getSelection(), range = document.createRange();
			range.selectNodeContents(el);
			sel.removeAllRanges();
			sel.addRange(range);
		}
		const getDocumentLinks = (file,leaf) => {																										// get document links
			if ( !file ) { return }
			let document_links = (this.app.metadataCache?.getFileCache(file)?.links)?.map( link => link?.link ) || [];									// get document links from metadata cache
			let document_embeds = (this.app.metadataCache?.getFileCache(file)?.embeds)?.map( link => link?.link ) || [];									// get document embeds from metadata cache
			if ( this.settings.includeEmbeddedFiles === true ) { document_links = document_links.concat(document_embeds); }								// concat doc links & embedded files
			let query_links, query_block_links = [];
			let query_blocks = leaf.view?.editor?.containerEl?.querySelectorAll('.block-language-folder-overview,.block-language-dataview,.internal-query .search-result-container'); // query blocks
			for ( let i = 0; i < query_blocks?.length; i++ ) {
				query_links = [];
				query_blocks[i].querySelectorAll('a')?.forEach( link => query_links.push(link.href) ) || query_blocks[i].querySelectorAll('.search-result-container .tree-item-inner span:nth-of-type(2)')?.forEach( query_result => query_links.push(query_result?.innerText) );
				query_block_links.push(query_links)
			}
			if ( this.settings.includeBlockLinks === true ) { document_links = document_links.concat(query_block_links).flat() };						// concat document & query block links
			document_links = document_links.map(link => obsidian.normalizePath(link.split('//obsidian.md/').reverse()[0].replace(/%20/g,' ')));		// clean up links
			return document_links;
		}
		const getFilesFromLinks = (document_links) => {																									// get files from links
			let files = [];
			if ( document_links ) {
				document_links.forEach( link => {
					files.push(this.app.vault.getFileByPath(link) || this.app.metadataCache.getFirstLinkpathDest(link,''))
				})
			}
			return files;
		}
		const getFilesFromSearchResults = () => {
			let items = [];
			if ( workspace.getLeavesOfType('search')[0] && workspace.getLeavesOfType('search')[0].view?.dom?.vChildren?._children ) {
				workspace.getLeavesOfType('search')[0].view.dom.vChildren._children.forEach( item => items.push(item.file) )
			}
			return items
		}
		const findDuplicateLeaves = (leaves) => {
		  const seen = [], duplicateLeaves = [];
			leaves.forEach(leaf => {
				if ( !seen.includes(leaf?.view?.file) ) { seen.push(leaf); } else { duplicateLeaves.push(leaf); }
			});
			return [seen,duplicateLeaves];
		}
		const isVisible = (el) => {																														// determine if a scrollable el is visible
		    const rect = el.getBoundingClientRect();
			return ( rect.top >= el.offsetHeight && rect.bottom <= (window.innerHeight - el.offsetHeight || document.documentElement.clientHeight - el.offsetHeight) );
		}
		const inlineTitleIsVisible = () => { return getActiveLeaf()?.view?.inlineTitleEl?.offsetHeight > 0; }
		const isCompactMode = (tab_group) => { 
			return tab_group ? tab_group.containerEl.classList.contains('is_compact_mode') : !!workspace.rootSplit.containerEl.querySelectorAll('.is_compact_mode').length; 
		}
		// code modified from https://github.com/johnoscott/Obsidian-Close-Similar-Tabs:
		const activateLeafThenDetach = async (leafToActivate, leafToDetach, timeout) => {
			let _a;
			await activateLeaf(leafToActivate, timeout);
			leafToDetach?.setPinned(false);
			if ( Array.isArray(leafToDetach) ) { ( _a = leafToDetach.pop() ) === null ? void 0 : _a?.detach(); } else { leafToDetach?.detach(); }
		}
		const activateLeaf = async (leaf, timeout, bool) => {
			return delayedPromise( timeout, () => {
				workspace.setActiveLeaf(leaf, { focus: true });
				if ( bool ) { leaf?.containerEl?.click(); leaf?.tabHeaderEl?.click(); }
			});
		}
		const delayedPromise = (timeout, callback) => {
			return new Promise((resolve) => {
				setTimeout( () => {
					const result = callback();
					resolve(result);
				}, timeout);
			});
		}
		/*-----------------------------------------------*/
		// HOUSEKEEPING
		const setPinnedLeaves = () => {
			workspace.iterateAllLeaves( leaf => {
				if ( leaf.pinned === false ) { 
					leaf.containerEl.classList.add('temp_pinned'); leaf.tabHeaderEl.classList.add('temp_pinned'); leaf.setPinned(true);					// pin all unpinned leaves, add class
				} else {
					leaf.containerEl.classList.add('pinned');																							// add class for originally pinned leaves
				}
			});
		}
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
		const updateSavedIds = async (restore) => {																		// prune saved ids
			let app_id = this.app.appId, tab_group_ids = []; getAllTabGroups().forEach( tab_group => tab_group_ids.push(app_id+'_'+tab_group.id) );
			let saved_ids = this.settings.tabGroupIds, id_to_save = '', mode = '', filtered_ids = [];
			switch(true) {
				case restore === true:																													// remove ids
					filtered_ids = saved_ids.filter( (saved_id) => { 
						if ( saved_id.split('_')[0] === app_id && tab_group_ids.includes(saved_id.slice(0,-3)) ) { return false } else { return true }	// remove id or preserve ids from other vaults
					} );																																		break;
				default:																																// add ids
					getAllTabGroups().forEach( tab_group => {
						switch(true) {
							case tab_group.containerEl.classList.contains('is_semi_compact_mode'):	mode = '@2';	break;
							case tab_group.containerEl.classList.contains('is_compact_mode'):		mode = '@1';	break;
							case tab_group.containerEl.classList.contains('is_continuous_mode'):	mode = '@0';	break;
							default:																mode = null;
						}
						if ( mode !== null ) { id_to_save = [app_id,tab_group.id,mode].join('_'); }
						filtered_ids.push(id_to_save);
					});
					saved_ids.forEach( saved_id => { if ( saved_id.split('_')[0] !== app_id ) { filtered_ids.push(saved_id) } });		// need to merge or preserve saved ids from other vaults
			}
			this.settings.tabGroupIds = [...new Set(filtered_ids.filter(el => el ?? true))];
			this.saveSettings();																										// save the settings
		};
		/*-----------------------------------------------*/
		// ICONS
		const icons = {
			appendFolder: `<svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-down" version="1.1" id="svg2" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"> <defs id="defs2" /> <rect width="18" height="18" x="3" y="3" rx="2" id="rect1" /> <path d="m 12,8 v 8" id="path1" /> <path d="m 8,12 4,4 4,-4" id="path2" /> <path d="M 15.999999,8 H 8" id="path1-2" /></svg>`,
			panelTopDashed: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-top-dashed"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M14 9h1"/><path d="M19 9h2"/><path d="M3 9h2"/><path d="M9 9h1"/></svg>`,
			replaceFolder: `<svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-down" version="1.1" id="svg2" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"> <defs id="defs2" /> <rect width="18" height="18" x="3" y="3" rx="2" id="rect1" /> <path d="m 8,14 4,4 4,-4" id="path2" /> <path d="m 8,9.9999586 4,-4 4,4" id="path2-3" /></svg>`,
			chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-chevron-down"><path d="m6 9 6 6 6-6"></path></svg>`,
			compactMode: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 1h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2M10 5.5H1M10 10H1M10 14.5H1M10 19V1"/></svg>`,
			semiCompactMode: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 1h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2M10 5.5H1M10 14.5H1M10 19V1"/></svg>`,
			arrowDownAZ: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down-az-icon lucide-arrow-down-a-z"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M20 8h-5"/><path d="M15 10V6.5a2.5 2.5 0 0 1 5 0V10"/><path d="M15 14h5l-5 6h5"/></svg>`,
			arrowDownZA: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down-za-icon lucide-arrow-down-z-a"><path d="m3 16 4 4 4-4"/><path d="M7 4v16"/><path d="M15 4h5l-5 6h5"/><path d="M15 20v-3.5a2.5 2.5 0 0 1 5 0V20"/><path d="M20 18h-5"/></svg>`,
			arrowDown01: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down01-icon lucide-arrow-down-0-1"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><rect x="15" y="4" width="4" height="6" ry="2"/><path d="M17 20v-6h-2"/><path d="M15 20h4"/></svg>`,
			arrowDown10: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down10-icon lucide-arrow-down-1-0"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M17 10V4h-2"/><path d="M15 10h4"/><rect x="15" y="14" width="4" height="6" ry="2"/></svg>`
		} 
		const addIcons = () => {
		  Object.keys(icons).forEach((key) => {
			  (0, obsidian.addIcon)(key, icons[key]);
		  });
		};
		addIcons();
		/*-----------------------------------------------*/
		// TOGGLE CONTINUOUS MODE
		const toggleContinuousMode = (tab_group_ids,restore,mode) => {
			if ( tab_group_ids.length === 0 ) { return }
			tab_group_ids.forEach( tab_group_id => {
				let current_app_id = tab_group_id.split('_')[0], current_tab_group_id = tab_group_id.split('_')[1], class_names = '', compact_mode = false;
				if ( this.app.appId !== current_app_id )																					{ return }	// if not in current vault
				let tab_group = getTabGroupById(current_tab_group_id);
				mode = ( restore === true && mode === undefined ? tab_group_id.split('_')?.[2] : mode );												// use stored mode or mode from 
				switch(true) {
					case !tab_group: 																						updateSavedIds();	break;
					case restore === true:																												// restore modes on startup
						tab_group.containerEl?.classList?.add('is_continuous_mode');
						switch(true) {
							case mode === "@1" && tab_group === workspace.rootSplit?.children[0]:
								tab_group.containerEl?.classList?.remove('is_semi_compact_mode');
								tab_group.containerEl?.classList?.add('is_compact_mode'); compact_mode = true;									break;
							case mode === "@2" && tab_group === workspace.rootSplit?.children[0]: 
								tab_group.containerEl?.classList?.remove('is_compact_mode');
								tab_group.containerEl?.classList?.add('is_semi_compact_mode');													break;
						}																														break;
					default:																															// add continuous mode on toggle, etc.
						class_names = tab_group?.containerEl.className;
						switch(true) {
 							case ( /\@0/.test(mode) ):
								tab_group?.containerEl?.classList?.remove('is_compact_mode','is_semi_compact_mode');									// remove compact mode classes
								tab_group?.containerEl?.classList?.toggle('is_continuous_mode');												break;	// add continuous mode class
 							case ( /\@1/.test(mode) ):
 								switch(true) {
									case ( /is_semi_compact_mode/.test(class_names) ): 
										tab_group?.containerEl?.classList?.remove('is_semi_compact_mode');
										tab_group?.containerEl?.classList?.add('is_compact_mode');												break;	// toggle compact mode classes
									case ( /is_compact_mode/.test(class_names) ):
										tab_group?.containerEl?.classList?.remove('is_compact_mode');											break;	// remove compact mode class
									default:										
										tab_group?.containerEl?.classList?.add('is_continuous_mode','is_compact_mode');	compact_mode = true;			// add compact mode classes	
 									}																											break;
 							case ( /\@2/.test(mode) ):
 								switch(true) {
									case ( /is_compact_mode/.test(class_names) ): 
										tab_group?.containerEl?.classList?.remove('is_compact_mode');
										tab_group?.containerEl?.classList?.add('is_semi_compact_mode');											break;	// toggle semi_compact mode classes
									case ( /semi_compact_mode/.test(class_names) ):
										tab_group?.containerEl?.classList?.remove('is_semi_compact_mode');										break;	// remove semi_compact mode class
									default:										
										tab_group?.containerEl?.classList?.add('is_continuous_mode','is_semi_compact_mode');							// add semi_compact mode classes	
 									}																											break;
						}
 						updateSavedIds(false);
				}
				if ( compact_mode === true ) { openInRightSplit(tab_group?.children?.find( leaf => leaf.containerEl.classList.contains('mod-active') ) || tab_group?.children[0] ); }
				if ( this.settings.alwaysHideNoteHeaders === true && !tab_group?.containerEl?.classList?.contains('show_note_titles') ) {
					tab_group?.containerEl?.classList?.add('hide_note_titles');	tab_group?.containerEl?.classList?.remove('show_note_titles');
				} else {
					tab_group?.containerEl?.classList?.add('show_note_titles');	tab_group?.containerEl?.classList?.remove('hide_note_titles');
				}
				if ( this.settings.enableScrollIntoView === false )		{ tab_group?.containerEl?.classList?.add('is_enable_scroll') }
				if ( this.settings.enableSmoothScroll === true )		{ tab_group?.containerEl?.classList?.add('is_smooth_scroll') }
				if ( this.settings.enableTypewriterScroll === true )	{ tab_group?.containerEl?.classList?.add('is_typewriter_scroll') }
				if ( this.settings.onlyShowFileName === true )			{ tab_group?.containerEl?.classList?.add('only_show_file_name'); }
			})
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
			let leaves_container = e.target.closest('.workspace-tabs').querySelector('.workspace-tab-container');						// get current tab container
			let leaves = Array.from(leaves_container.children);																			// get current tab container leaves
			let final_tab_header_index = getTabHeaderIndex(e);																			// get final dropped tab header index
			let moved = leaves.splice(initial_tab_header_index,1);																		// get the moved leave
			let rearranged = leaves.toSpliced(final_tab_header_index,0,moved[0]);														// move the moved leaf into position
			leaves_container.setChildrenInPlace(rearranged);																			// replace tab container content with rearranged leaves
			workspace.activeTabGroup?.tabHeaderEls[final_tab_header_index]?.click();													// confirm drag and focus leaf by clicking tab
		}
		/*-----------------------------------------------*/
		// SCROLL ACTIVE ITEMS INTO VIEW
		const scrollRootItems = (e,target) => { 
			if ( this.settings.enableScrollIntoView === false ) { return; }
			let behavior = ( this.settings.enableSmoothScroll === false || this.settings.enableScrollIntoView === false ? 'instant' : 'smooth' );
			let workspaceTabs = target.closest('.workspace-tabs');
			let activeLeaf = target || workspaceTabs?.querySelector('.workspace-leaf.mod-active') || getActiveLeaf();
			let workspaceTabsHeader = workspaceTabs?.querySelector('.workspace-tab-header-container');
			workspaceTabs?.querySelector('.workspace-tab-container')?.scrollTo({top:activeLeaf.offsetTop - workspaceTabsHeader?.offsetHeight,behavior:behavior}); 	// scroll leaf into view
			scrollTabHeader(e); 																										// scroll tab into view
		}
		const scrollTabHeader = (e) => {
			if ( this.settings.enableScrollIntoView === false ) { return }
			let tabHeaderEl = ( e ===  null ? workspace.getMostRecentLeaf().tabHeaderEl : workspace.getActiveViewOfType(obsidian.View).leaf.tabHeaderEl )
			let tabsContainer = tabHeaderEl.parentElement;
			tabsContainer.scrollTo({left:(tabHeaderEl.offsetLeft - tabHeaderEl.offsetWidth),behavior:'smooth'});
		}
		const scrollToActiveLine = (e,el) => {
			if ( this.settings.enableScrollIntoView === false || this.settings.enableTypewriterScroll === false ) { return }
			let offset = 0, behavior = ( ( this.settings.enableSmoothScroll === false || /page/i.test(e?.key) ) ? 'instant' : 'smooth' )
			switch(true) {
				case ( /metadata-/.test(el?.className) ):																				// scroll metadata/properties
				case ( /metadata-/.test(e?.target.className) ):																			// scroll metadata/properties
					getActiveEditor()?.containerEl?.querySelector('.cm-active')?.classList?.remove('cm-active');							// deselect editor active line
					switch(true) {
						case el !== undefined:
							el?.focus();
							workspace.activeTabGroup.tabsContainerEl.scrollTo(
								{ top:getActiveLeaf().containerEl.offsetTop - workspace.activeTabGroup.tabHeaderContainerEl.offsetHeight 
								- getActiveLeaf().containerEl.querySelector('.metadata-properties-heading').offsetTop 
								- workspace.activeTabGroup.containerEl.offsetHeight/2, behavior:behavior });
							break;
						default:			document.activeElement.scrollIntoView({behavior:behavior,block:'center'});
					}									
					break;
				default:																												// scroll editor
					offset = ( workspace.activeEditor !== null 
						? getActiveLeaf().containerEl.offsetTop + getActiveLeaf().containerEl.querySelector('.cm-active')?.offsetTop 
							+ getActiveLeaf().containerEl.querySelector('.view-header').offsetHeight - workspace.activeTabGroup.containerEl.offsetHeight/2 
						: getActiveLeaf().containerEl.offsetTop - getActiveLeaf().tabHeaderEl.closest('.workspace-tab-header-container').offsetHeight
					);
					workspace.activeTabGroup.tabsContainerEl.scrollTo({top:offset,behavior:behavior});
			}
		}
		const scrollSideBarItems = (target) => {
			let type = ( /workspace-leaf|workspace-tab-header|nav-header|view-header-title-container|nav-buttons-container/.test(target?.className) ? 'leaf' : 'item' );
			let workspace_tabs = target?.closest('.workspace-tabs.mod-active.is_continuous_mode');
			if ( this.settings.enableScrollIntoView === false || workspace_tabs === null ) { return }
			let workspace_tabsContainer = workspace_tabs?.querySelector('.workspace-tab-container');
			let scrollEl = ( type === 'leaf' ? workspace_tabs.querySelector('.workspace-leaf.mod-active') : target );
			let active_leaf = workspace_tabs.querySelector('.workspace-leaf.mod-active');
			let adjust_height = (active_leaf.parentElement.offsetHeight/2) - active_leaf.querySelector('.nav-header')?.offsetHeight || 0;	// center focused item
			switch(true) {
				case ( /workspace-leaf-content/.test(target?.className) && target?.dataset.type === 'search' ):
					workspace_tabsContainer.scrollTo({top:workspace.activeLeaf.containerEl.offsetTop - workspace_tabs.querySelector('.workspace-tab-header-container').offsetHeight,behavior:'smooth'});
					break;
				case type === 'leaf':	
					workspace_tabsContainer.scrollTo({top:scrollEl.offsetTop - workspace_tabs.querySelector('.workspace-tab-header-container').offsetHeight,behavior:'smooth'});
					break;
				case type === 'item' && target !== null && !isVisible(target):				// only scroll if item is not visible
					target.scrollIntoView({behavior:'smooth',block:'center'});
					break;
			}
		}
		const scrollItemsIntoView = obsidian.debounce( async (e,el) => {
			let target = ( el ? el : /body/i.test(e?.target?.tagName) ? workspace.getActiveViewOfType(obsidian.View).containerEl : e?.target || e?.containerEl );
			if ( target === undefined || target.closest('.is_continuous_mode') === null || /menu-item-title/.test(e?.target?.className) ) { return } // ignore e.target ancestor is not in continuous mode
			switch(true) {
				case ( target.closest('.mod-sidedock.mod-left-split,.mod-sidedock.mod-right-split') !== null ):	scrollSideBarItems(target);	break;	// scroll sidebar items
				case ( /workspace-tab-header|workspace-leaf/.test(target.className) ):		scrollRootItems(e,target);						break;	// scroll leaf into view
				default: 							 										scrollTabHeader();	scrollToActiveLine(e);		break;	// scroll active line into view
			}
		},0);
		/*-----------------------------------------------*/
		// ARROW NAVIGATION between open leaves
		const leafArrowNavigation = (e) => {
			let active_leaf = getActiveLeaf(), activeTabGroupChildren = workspace.activeTabGroup.children, el = null, anchorNode = getSelection()?.anchorNode;
			const is_last_line = () => {
				return getActiveCursor()?.ch === getActiveEditor()?.getLine(getActiveEditor()?.lastLine()).length && getActiveCursor()?.line === ( getActiveEditor()?.lastLine() ); 
			}
			switch(true) {																																// Ignore arrow navigation function in these cases:
				case workspace.leftSplit.containerEl.querySelector('.workspace-leaf.mod-active .tree-item:has(.is-selected,.has-focus,.is-active)') !== null:
				case workspace.rightSplit.containerEl.querySelector('.workspace-leaf.mod-active .tree-item:has(.is-selected,.has-focus,.is-active)') !== null:
					el = ( workspace.leftSplit.containerEl.querySelector('.workspace-leaf.mod-active .tree-item:has(.is-selected,.has-focus,.is-active)') !== null 
						? workspace.leftSplit.containerEl.querySelector('.workspace-leaf.mod-active .tree-item:has(.is-selected,.has-focus,.is-active)') 
						: workspace.rightSplit.containerEl.querySelector('.workspace-leaf.mod-active .tree-item:has(.is-selected,.has-focus,.is-active)') );
																														scrollSideBarItems(el);	return;	// scroll focused left/right split item into view
				case !active_leaf.parent.containerEl.classList.contains('is_continuous_mode'): 													return; // not in continuous mode
				case isCompactMode():			compactModeNavigation(e,active_leaf,activeTabGroupChildren);									return;	// use compact mode navigation
				case /metadata-input|multi-select/.test(e.target.classList):
				case e.target.closest('.view-header') !== null:																							// allow arrows in note headers
				case getActiveLeaf()?.containerEl?.closest('.mod-root') === null && !getActiveEditor()?.hasFocus():										// not in editor
				case e.target.contentEditable === 'true' && /Arrow/.test(e.key): 																		// editing canvas
				case e.target.querySelector('.canvas-node.is-focused') && /Arrow/.test(e.key): 															// editing canvas
				case e.target.querySelector('.workspace-leaf-content[data-set="graph"]') && /Arrow/.test(e.key) && e.shiftKey:					return;	// graph active; use shift key to move graph
			}
			e.preventDefault();
			switch(e.key) {
				case 'ArrowUp': case 'ArrowLeft': case 'PageUp':
					switch(true) {
						case getActiveCursor()?.line === 1:	getActiveEditor().containerEl.classList.add('first-line-active');					return;	// add class to prevent immediate nav up
						case e.target === active_leaf.view.inlineTitleEl && e.key === 'ArrowLeft' && inlineTitleIsVisible():							// inline title allow arrowleft
						case getAnchorOffset() !== 0 
							 && e.key === 'ArrowUp'
							 && /inline-title/.test(anchorNode?.parentElement?.className) 
							 && inlineTitleIsVisible():	 																						return; // inline-title arrowup
						case ( getActiveCursor()?.line === 0 )
							 && e.key !== 'ArrowLeft'
							 && /cm-/.test(anchorNode?.parentElement?.className)
							 && /inline-title-/.test(e.target.className)
							 && !getActiveEditor().containerEl.classList.contains('first-line-active')
							 && inlineTitleIsVisible():
							 	e.preventDefault(); getActiveEditor().containerEl.classList.add('first-line-active');						 	return;	// first editor line becomes active
						case getActiveCursor()?.ch === 0 && getAnchorOffset() === 2 
							 && e.key !== 'ArrowLeft'
							 && /inline-title|cm-/.test(anchorNode?.parentElement?.className)
							 && inlineTitleIsVisible():																									// nobreak
						case getActiveCursor()?.line === 0 && getAnchorOffset() === 0 
							 && e.key !== 'ArrowLeft'
							 && /cm-/.test(anchorNode?.parentElement?.className)
							 && !getActiveEditor().containerEl.classList.contains('first-line-active')
							 && inlineTitleIsVisible():																									// nobreak
						case getActiveCursor()?.line === 0 && getAnchorOffset() === 2 
							 && e.key === 'ArrowLeft'
							 && /HyperMD-header/.test(anchorNode?.className)
							 && inlineTitleIsVisible():
								selectAll(active_leaf.view.inlineTitleEl);																		break;	// select inline-title text (default behavior)
 						case ( /outliner-editor-view/.test(active_leaf.getViewState().type) ):
						case ( /metadata-/.test(e.target.className) && !/metadata-properties-head/.test(e.target.className)):					break;	// select previous metadata item
						case ( /html/.test(active_leaf.view.getViewType()) && !/ArrowLeft/i.test(e.key) ): 												// html left arrow nav page up
							active_leaf.containerEl.querySelector('iframe').focus();
							active_leaf.containerEl.querySelector('iframe').contentWindow.scrollBy({top:-250,left:0,behavior:'smooth'});		break;
						case ( /pdf/.test(active_leaf.view.getViewType() ) ):
							switch(true) {
								case e.key === 'ArrowLeft':																						return;	// pdf page navigation
								case e.key === 'ArrowUp':																								// pdf navigation up arrow to previous leaf
									active_leaf.view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
									active_leaf.view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');		// nobreak
							}																															// nobreak
						case getAnchorOffset() > 0 && /HyperMD-header/.test(e.target.className) &&		e.key === 'ArrowUp' && !inlineTitleIsVisible():
						case /metadata-properties-heading/.test(e.target.classList) &&					e.key === 'ArrowUp' && !inlineTitleIsVisible():
						case getActiveCursor()?.line === 0 && getActiveCursor()?.ch === 0 && /inline-title/.test(e.target.className):
						case getActiveCursor()?.line === 0 && getActiveCursor()?.ch === 0 && 			e.key === 'ArrowUp' && !inlineTitleIsVisible():
						case getActiveCursor()?.line === 0 && getAnchorOffset() === 2 && /HyperMD-header/.test(anchorNode?.classList) && e.key === 'ArrowUp' && !inlineTitleIsVisible():
						case getAnchorOffset() === 0 && e.target === active_leaf.view.inlineTitleEl &&	e.key === 'ArrowUp':
						case getActiveLeaf().getViewState().state.mode === 'preview' && e.key !== 'ArrowLeft':											// leaf is in preview mode
						case ( !/markdown/.test(active_leaf.getViewState().type) ):																		// nobreak; leaf is empty (new tab)
							switch(true) {
								case this.settings.navigateInPlace === true:														navigateInPlace(e);	return; // navigate in place; return
								case active_leaf.containerEl.previousSibling !== null:																			// if not first leaf
									e.preventDefault();																											// prevent up arrow when leaf activates
									workspace.setActiveLeaf(activeTabGroupChildren[activeTabGroupChildren.indexOf(active_leaf) - 1],{focus:true});				// make previous leaf active 
									getActiveEditor().focus();
									getActiveEditor()?.setCursor({line:getActiveEditor()?.lastLine(),ch:getActiveEditor()?.lastLine()?.length - 1});	return;	// select last char if editor
							}
					}																															break;
				case 'ArrowDown':	case 'ArrowRight': case 'PageDown':
					switch(true) {
						case getActiveEditor()?.getLine(getActiveEditor()?.lastLine()).length === getAnchorOffset() 
							 && getActiveCursor()?.line === getActiveEditor()?.lastLine() 
							 && e.key === 'ArrowDown' 
							 && !getActiveEditor().containerEl.classList.contains('last-line-active'): 
								getActiveEditor().containerEl.classList.add('last-line-active');														// add last line active class
								getActiveEditor()?.setCursor({line:getActiveEditor()?.lastLine(),ch:getActiveEditor()?.getLine(getActiveEditor()?.lastLine()).length});	
								return;																													// last line active
						case e.target === active_leaf.view.inlineTitleEl && inlineTitleIsVisible() 
							 && e.key === 'ArrowDown':
							 	e.preventDefault();																								break;	// inline-title ArrowDown
						case e.target === active_leaf.view.inlineTitleEl && inlineTitleIsVisible() 
							 && e.key === 'ArrowRight':																							break;	// inline-title ArrowRight
						case getAnchorOffset() !== 0 && e.key === 'ArrowDown' 
							 && /inline-title/.test(anchorNode?.parentElement?.className) 
							 && inlineTitleIsVisible(): 
							selectAll(active_leaf.view.inlineTitleEl);																			break;	// inline title select text
						case ( /outliner-editor-view/.test(active_leaf.getViewState().type) ):
						case ( /metadata-/.test(e.target.className) ): 																			break;
						case ( /html/.test(active_leaf.view.getViewType() ) && e.key === 'ArrowRight' ):												// html page right arrow nav page down
							active_leaf.containerEl.querySelector('iframe').focus();
							active_leaf.containerEl.querySelector('iframe').contentWindow.scrollBy({top:250,left:0,behavior:'smooth'});			break;
						case ( /pdf/.test(active_leaf.view.getViewType() ) ):
							switch(true) {
								case e.key === 'ArrowRight':																					return;	// pdf page navigation
								case e.key === 'ArrowDown':																								// pdf navigation down arrow to next leaf
									active_leaf.view.viewer?.containerEl?.querySelector('.pdf-toolbar')?.blur();
									active_leaf.view.viewer.containerEl.querySelector('.focused_pdf_page')?.classList.remove('focused_pdf_page');		// nobreak
							}																															// nobreak
						case is_last_line() && e.key !== 'ArrowRight':																					// is last line
						case getActiveLeaf().getViewState().state.mode === 'preview' && e.key !== 'ArrowRight':											// leaf is in preview mode
						case  is_last_line() && ( !/markdown/.test(active_leaf.getViewState().type) ):
							switch(true) {
								case this.settings.navigateInPlace === true:												navigateInPlace(e);	return;	// navigate in place
								default:
									workspace.setActiveLeaf((activeTabGroupChildren[activeTabGroupChildren.indexOf(active_leaf) + 1] || active_leaf),{focus:true});	// make next leaf active
									getSelection()?.removeAllRanges();
									getActiveEditor().focus();
									if ( getActiveLeaf().getViewState().state.mode !== 'preview' ) {
										switch(true) {
											case inlineTitleIsVisible(): e.preventDefault();
												getActiveLeaf().view?.inlineTitleEl.focus();
												selectAll(getActiveLeaf().view?.inlineTitleEl);		
												el = getActiveLeaf().view?.inlineTitleEl;														break;	// focus inline-title
											case getActiveLeaf().containerEl.querySelector('.metadata-container').offsetHeight > 0:
											case !inlineTitleIsVisible() && getActiveLeaf().containerEl.querySelector('.metadata-container').offsetHeight > 0:
												getActiveLeaf().containerEl.querySelector('.metadata-properties-heading').focus();
												el = getActiveLeaf().containerEl.querySelector('.metadata-properties-heading');					break;	// focus metadata heading
											default:
												getActiveEditor()?.setCursor({line:0,ch:0}); 													// select first line, first char
										}
									}
								}
					}																															break;
			}
			sleep(0).then( () => { scrollItemsIntoView(e,el); });
		}
		// COMPACT MODE NAVIGATION
		const compactModeNavigation = (e,active_leaf,activeTabGroupChildren) => {
			let incr = ( /Down|Right/.test(e.key) ? 1 : -1 ), index = activeTabGroupChildren.indexOf(active_leaf) + incr;
			let next_leaf = ( activeTabGroupChildren[index] ? activeTabGroupChildren[index] : incr === 1 ? activeTabGroupChildren[0] : activeTabGroupChildren[activeTabGroupChildren.length - 1]);
			delete active_leaf.containerEl.querySelector('iframe')?.scrolling;
			openInRightSplit(next_leaf);																								// open file in right split
			scrollItemsIntoView(e,next_leaf.containerEl);
		}
		const navigateInPlace = (e,direction) => {																						// navigate in place
			let tree = workspace.getLeavesOfType('file-explorer')[0].view.tree;
			direction = ( direction !== undefined ? direction : e.key === 'ArrowUp' ? 'backwards' : 'forwards' );
			tree.setFocusedItem(tree.view.activeDom);
			sleep(100).then(() => { 
				tree.changeFocusedItem(direction);																						// change the focused explorer item
				switch(true) {
					case tree.focusedItem.file instanceof obsidian.TFile:
						workspace.getMostRecentLeaf().openFile(tree.focusedItem.file,{focus:true});										// open the focused explorer item
						workspace.setActiveLeaf(workspace.getMostRecentLeaf());													break;	// set the active leaf
					case tree.focusedItem.file instanceof obsidian.TFolder:
						if ( workspace.app.plugins.enabledPlugins.values().find( (value) => value === 'smooth-explorer') ) {
							tree.selectItem(tree.focusedItem);
							tree.setFocusedItem(tree.focusedItem);
							workspace.setActiveLeaf(tree.view.leaf);
						}																										break;
				}
			})
		}
		/*-----------------------------------------------*/
		// OPEN ITEMS IN CONTINUOUS MODE getAllTabGroups
		const openItemsInContinuousMode = async (items,action,type) => {
			if ( !items ) { resetPinnedLeaves(); return }
			let mode = ( /^semi_compact/m.test(action) ? '@2' : /compact/.test(action) ? '@1' : '@0' )
			let active_leaf, new_leaf, recent_leaf = workspace.getMostRecentLeaf(), direction, bool, dupe = null, last_opened_leaf = null, found = null, index = null; 
			let open_files = [], open_leaves = [], included_extensions = [];
			recent_leaf?.parent?.children?.forEach( child => { open_files.push(child?.view?.file); open_leaves.push(child) });			// get open files in active tab group
			let duplicateLeaves = findDuplicateLeaves(open_leaves);
			let appended_leaf = ( items.length === 1 ? open_leaves.find( open_leaf => items[0] === open_leaf.view.file ) : null );
			let extensions = { 
				markdown:	['md'],
				base:		['base'],
				images:		['avif','bmp','jpg','jpeg','gif','png','svg','webp'],
				canvas:		['canvas'],
				media:		['aac','aif','aiff','ape','flac','m4a','mka','mp3','ogg','opus','wav','m4v','mkv','mov','mp4','mpeg','webm'],
				pdf:		['pdf']
			};
			for (const [key, value] of Object.entries(extensions)) { if ( this.settings.includedFileTypes.includes(key) ) { included_extensions.push(value); } }	// get included extensions
			included_extensions = included_extensions.concat(this.settings.extraFileTypes).flat(Infinity).map( ext => ext.trim() );					// add extra file types, trim, and flatten
			open_files = open_files.filter( file => typeof file !== 'undefined' );
			items = items.filter( 
				item => item instanceof obsidian.TFile 																								// item must be TFile
				&& included_extensions.includes( item.extension ) 																					// remove items included by extension
				&& !this.settings.excludedNames.includes( item.basename +'.'+ item.extension )														// remove items excluded by name
			);
			switch(true) {																															// warnings:
				case items.length > this.settings.maximumItemsToOpen && !window.confirm('Continuous Mode:\nOpening '+ this.settings.maximumItemsToOpen +' of '+ items.length +' items.\n\n(Change the “Maximum number of items to open at one time” setting to adjust this value.)'):									resetPinnedLeaves(); return; // opening multiple items
				case (/replace/.test(action)) && this.settings.disableWarnings !== true 
					&& !window.confirm('Continuous Mode:\nYou are about to replace all items currently open in the active split.\nAre you sure you want to do this?\n\n(This warning can be disabled in the settings.)'): 
																														resetPinnedLeaves(); return; // confirm replacing open items
				case items.length === 0:
					alert(type === 'document links' ? 'Continuous Mode: No document links found.' : 
						'Continuous Mode:\n\nNo readable files found.\n\nCheck the Settings to see if you have included any specific file types to be opened in Continuous Mode.'); 
																														resetPinnedLeaves(); return; // alert no items found
			}
			switch(true) {
				case ( /replace/i.test(action) ):
					workspace.setActiveLeaf(recent_leaf,{focus:true});
					switch(true) {
						case appended_leaf !== null:																				// open single file ==> close all open leaves except appended leaf
							workspace.activeTabGroup.children.forEach( child => { if ( child !== appended_leaf ) { activateLeafThenDetach(child,child,0); } });			break;
						default:																									// open folder/multiple files ==> close all open leaves
							workspace.activeTabGroup.children.forEach( child => {activateLeafThenDetach(child,child,0);});	break;
					}																										break;
				case ( /append/.test(action) ):																						// append items in active tab group
					if ( items.length > 1 ) { items = items.filter( item => !open_files.includes(item) ); }					break;	// no dupe notes
				default:																											// open items in new splits L/R/U/D
					switch(true) {
						case (/down/.test(action)):							direction = 'horizontal';	bool = false; 		break;
						case (/up/.test(action)):							direction = 'horizontal';	bool = true;		break;
						case (/left/.test(action)):							direction = 'vertical';		bool = true;		break;
						case (/right/.test(action)):						direction = 'vertical';		bool = false;		break;
					}
					new_leaf = workspace.createLeafBySplit(workspace.getMostRecentLeaf(),direction,bool);							// create new split
					workspace.setActiveLeaf(new_leaf,{focus:true});
			}
			let first_leaf = null;
			const openItems = async (items) => { 
				let maximumItemsToOpen = ( this.settings.maximumItemsToOpen < 1 || this.settings.maximumItemsToOpen === undefined ? Infinity : this.settings.maximumItemsToOpen ), sort_order;
				switch(true) {
					case items.length <= 1:																																		
							if ( getLeafByFile(items[0]) ) {																		// prevent dupes
								found = getLeafByFile(items[0]);
								workspace.setActiveLeaf(found); found?.tabHeaderEl?.click();										// set already opened leaf active
							} else {
								workspace.setActiveLeaf(workspace.getLeaf('tab'),{focus:true});										// or if not dupe open item in new tab
								workspace.getActiveViewOfType(obsidian.View).leaf.openFile(items[0],{active:true});					// make new tab active
							}
							first_leaf = workspace.getActiveViewOfType(obsidian.View).leaf;																						break;
					default:
						sort_order = (																															// get sort order
							/query block links|document links|longform/i.test(type) ? 'none' 																	// open links, etc. in listed order
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
						workspace.activeTabGroup.containerEl.dataset.sort_order = sort_order;							// set data-sort_order
						if ( this.settings.indexFilesAtTop === true ) {
							index = items.find( item => ( (/index/i.test(item.basename) || /^item.basename$/im.test(item.parent.name)) && /md/i.test(item.extension) ) ); // find index file
							if ( index ) { items.splice(items.indexOf(index),1); items.unshift(index); }				// move index file to beginning of items
						}
						for ( let i = 0; i < maximumItemsToOpen && i < items.length; i++ ) {							// limit number of items to open
							active_leaf = workspace.getLeaf();															// open new tab/leaf
							active_leaf.openFile(items[i]);																// open file
							active_leaf.setPinned(true);																// pin each new tab/leaf to stop Obsidian reusing it to open next file in loop
							if ( i === 0 ) { first_leaf = active_leaf; }
						}
				workspace.activeTabGroup.children.forEach( child => { if ( child.getViewState().type === 'empty' ) { activateLeafThenDetach(child,child,0); }  });	// remove empty leaf
				}
				toggleContinuousMode([this.app.appId +'_'+ first_leaf.parent.id],true,mode);							// ensure continuous mode
				this.settings.tabGroupIds.push(this.app.appId +'_'+ first_leaf.parent.id +'_'+ mode);
				this.settings.tabGroupIds = [...new Set(this.settings.tabGroupIds)]
				this.saveSettings();
			}
			openItems(items).then(resetPinnedLeaves()).then(activateLeaf(first_leaf,500,true));							// open items, then reset pins, then activate first leaf
		 }
		 // end openItemsInContinuousMode
		/*-----------------------------------------------*/
		const makeFirstLeafInRightSplitActive = (split) => {
			let bool = ( !workspace.rootSplit.children[1] ? false : true );															// is there a right split?
			let source_split = split || workspace.rootSplit.children[1] || workspace.createLeafBySplit(workspace.rootSplit,'vertical',true);	// create a right split if one doesn't exist
			switch(true) {
				case source_split?.type === 'tabs':		workspace.setActiveLeaf(source_split.children[0],{focus:true});		break;	// 
				case source_split?.type === 'split':	makeFirstLeafInRightSplitActive(source_split.children[0]);			break;	// recurse through splits until a tabs container is reached
			}
			if ( !bool ) { workspace.setActiveLeaf(source_split,{focus:true}); }													// focus empty tab in right split
		}
		const openInRightSplit = (leaf) => {
			makeFirstLeafInRightSplitActive();
 			getActiveLeaf().openFile(leaf.view.file,{active:false});																// open file
 			workspace.setActiveLeaf(leaf,{focus:true});
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
			active_tab_group.children.forEach( child => { activateLeafThenDetach(child,child,0); });
			sorted.forEach( item => {																					// open the files
				active_split = workspace.getLeaf();																		// open new tab/leaf
				active_split.openFile(item.view.file);																	// open file
				active_split.setPinned(true);																			// pin new tab/leaf to prevent Obsidian reusing it to open next file in loop
			});
			workspace.iterateAllLeaves( leaf => { if ( !pinned_leaves.includes(leaf.id) ) { leaf.setPinned(false); }});	// unpin all tabs, except for originally pinned tabs
			active_tab_group.containerEl.dataset.sort_order = sort_order;												// set data-sort_order
		 };
		/*-----------------------------------------------*/
		// REGISTER DOM EVENTS
		this.registerDomEvent(document,'click', (e) => {
			let action = this.settings.allowSingleClickOpenFolderAction, path = '', items = null, active_leaf, active_compact_leaf;
			switch(true) {
				case ( /tree-item-icon/.test(e.target.className) ):
				case e.target.closest('.sidebar-toggle-button') !== null:										e.stopPropagation();					break;
				case typeof e.target.className === 'string' && e.target?.className?.includes('metadata-'):												break;
				case e.target.classList.contains('continuous_mode_open_links_button'):																			// nobreak
				case e.target.closest('.continuous_mode_open_links_button') !== null:							showLinksMenu(e);						break;	// open links in continuous mode
				case e.target.closest('.workspace-tabs.is_compact_mode') !== null 																		// compact mode: open in right split on tab click
					&& e.target.closest('.workspace-tab-header-new-tab') === null && e.target.closest('.workspace-tab-header-tab-list') === null:
						active_compact_leaf = workspace.getActiveViewOfType(obsidian.View)?.leaf;
						if ( active_compact_leaf.parent.containerEl.classList.contains('is_compact_mode') ) { openInRightSplit(active_compact_leaf); }
						scrollItemsIntoView(e,active_compact_leaf.containerEl);
						workspace.setActiveLeaf(active_compact_leaf,{focus:true})
					break;
				case ( /nav-folder-title/.test(e.target.className) && this.settings.allowSingleClickOpenFolder === true )  								// open file explorer folders on single click
						&& e.target.closest('.nav-folder-collapse-indicator') === null && e.target.closest('.collapse-icon') === null
						&& !e.altKey && !e.ctrlKey && !e.shiftKey && e.button !== 2:
						switch(true) {
							case action === 'disabled':						return alert("Continuous Mode:\nPlease select a single click action in the settings.");
							default:	sleep(0).then( () => {
											path = e.target.closest('.nav-folder-title')?.dataset?.path, items = this.app.vault.getFolderByPath(path)?.children;
											openItemsInContinuousMode(items,action,'folder');
										});
						}																																break;
				case e.target.classList.contains('menu-item-title'):																							// focus tab and scroll into view
					sleep(0).then( () => {
						active_leaf = workspace.activeTabGroup.children.find(child => child.tabHeaderEl.className.includes('is-active'));
						workspace.setActiveLeaf(active_leaf,{focus:true}); 
					});																																			// nobreak
				case ( /workspace-tab-header|nav-header|view-header-title-container/.test(e.target.className) 
						&& workspace.activeTabGroup.containerEl.classList.contains('is_continuous_mode') 
						&& !/view-header-title|inline-title/.test(e.target.className)):
					workspace.setActiveLeaf(getActiveLeaf(),{focus:true});	
					scrollItemsIntoView(e,getActiveLeaf().containerEl);																					break;	// click tab, scroll into view
			}
		});
		this.registerDomEvent(document,'mousedown', (e) => {
			let action = this.settings.allowSingleClickOpenFolderAction, path = '', items = null, active_leaf, active_compact_leaf;
			const testStr = /append .+ in active tab group|replace active tab group|open .+ in new split|compact mode:/i;
			switch(true) {
				case ( /tree-item-icon/.test(e.target.className) ):												e.stopPropagation();					break;
				case ( e.target.classList.contains('menu-item-title') && testStr.test(e.target.innerText) ):	setPinnedLeaves();						break; // CM menu items
				case ( /nav-folder-title/.test(e.target.className) && this.settings.allowSingleClickOpenFolder === true && !e.altKey && !e.ctrlKey && !e.shiftKey && e.button !== 2 ):
					setPinnedLeaves();
					e.target.closest('.nav-folder-title').addEventListener('click',function(e) { e.preventDefault();											// prevent default toggle folder collapse
						sleep(250).then(()=>{ workspace.getLeavesOfType('file-explorer')[0].view?.tree?.view?.activeDom?.parent?.setCollapsed(false); });		// uncollapse folder
					});																																	break;
				case ( /nav-file-title/.test(e.target.className) && this.settings.allowSingleClickOpenFolder === true ) && !e.altKey && !e.ctrlKey && !e.shiftKey && e.button !== 2:
					e.target.addEventListener('click',function(e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); })
					sleep(0).then( () => {
						path = e.target.closest('.nav-file-title').dataset?.path, items = this.app.vault.getFileByPath(path);
						setPinnedLeaves();
						openItemsInContinuousMode([items],action,'file'); 
					});																																	break;
				case e.target.closest('.workspace-tabs.is_compact_mode') !== null 
					&& e.target.closest('.workspace-tab-header-new-tab') === null && e.target.closest('.workspace-tab-header-tab-list') === null:		break;
				case (e.buttons === 2 || e.ctrlKey) && e.target.closest('.longform-explorer') !== null:		getLongformItems(e);						break;	// show longform menu
			}
		});
		this.registerDomEvent(document,'mouseup', (e) => {
			switch(true) {
				case ( /tree-item-icon/.test(e.target.className) ):												e.stopPropagation();
				case this.settings.allowSingleClickOpenFolder === false:
				case this.settings.allowSingleClickOpenFolderAction === 'disabled':
				case ( /Toggle Compact Mode/.test(e.target.innerText) ):																						// from Tab Group Menu
				case ( /mark_open_files/.test(e.target.className) ):																							// compatibility with mark-open-file plugin
				case e.altKey || e.ctrlKey || e.shiftKey || e.button === 2:																				break;	// do nothing
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
				continuous_mode_open_links_button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`;
			}
		});
		this.registerDomEvent(window,'keydown', (e) => {
			if ( /pageup|pagedown|arrow/i.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !/input|textarea/.test(e.target.tagName.toLowerCase() ) ) {
				leafArrowNavigation(e);
			}
		});	
		this.registerDomEvent(window,'dragstart', (e) => {
			if ( e.target.nodeType !== 1 || !e.target?.closest('.workspace-tabs')?.classList?.contains('is_continuous_mode') ) { return; }
			if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }					// get initial tab header index for onTabHeaderDragEnd()
		});
		/*-----------------------------------------------*/
		// ADD CONTEXTUAL MENU ITEMS
		const addContinuousModeMenuItem = (item, tab_group_id, leaf) => {																// add continuous mode menu items (toggle, headers, sort)
			let tab_group = getTabGroupById(tab_group_id?.split('_')[1]), tab_group_el = tab_group?.containerEl, tab_group_classList = tab_group_el?.classList;
			let isLeftLeaf = workspace.leftSplit === leaf?.parent?.parent;
			if ( this.app.isMobile === true ) { 
				addMobileMenuItems(item,tab_group,tab_group_el,tab_group_id,tab_group_classList); 
			} else {
				addDesktopMenuItems(item,tab_group,tab_group_el,tab_group_id,tab_group_classList,leaf);
			}
		}
		const addDesktopMenuItems = (item,tab_group,tab_group_el,tab_group_id,tab_group_classList,leaf) => {
			item.setTitle('Continuous Mode')
				.setIcon('scroll-text')
				.setSection( leaf ? 'pane' : 'action' )
				.setSubmenu().addItem((item2) => {
					item2.setTitle('Toggle Continuous Mode')
					.setIcon('scroll-text')
					.setChecked( tab_group_classList?.contains('is_continuous_mode') ? true : false )
					.onClick(async () => { 
						toggleContinuousMode([tab_group_id] || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@0');
					})
				})
				.addSeparator()
				.addItem((item12) => {
					if ( tab_group === workspace.rootSplit.children[0] ) {
						item12.setTitle('Toggle Semi-Compact Mode')
						.setIcon('semiCompactMode')
						// .setDisabled( tab_group_classList.contains('is_continuous_mode') ? false : true )
						.setChecked( tab_group_classList?.contains('is_semi_compact_mode') ? true : false )
						.onClick(async () => {
							toggleContinuousMode([tab_group_id] || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@2');
						})
					}
				})
				.addItem( (item12) => {
					if ( tab_group === workspace.rootSplit.children[0] ) {
						item12.setTitle('Toggle Compact Mode')
						.setIcon('compactMode')
						// .setDisabled( tab_group_classList.contains('is_continuous_mode') ? false : true )
						.setChecked( tab_group_classList?.contains('is_compact_mode') ? true : false )
						.onClick(async () => {
							toggleContinuousMode([tab_group_id] || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@1');
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
					addChangeSortOrderMenuItems(item4,tab_group,tab_group_el,tab_group_classList) 
				})
			.addSeparator();
		}
		// add mobile menu items
		const addMobileMenuItems = (item,tab_group,tab_group_el,tab_group_id,tab_group_classList) => {
			item.menu
				.addItem((item2) => {
					item2.setTitle('Toggle Continuous Mode')
					.setIcon('scroll-text')
					.setChecked( tab_group_classList?.contains('is_continuous_mode') ? true : false )
					.onClick(async () => { 
						toggleContinuousMode([tab_group_id] || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@0');
					})
				})
				.addItem((item12) => {
					if ( tab_group === workspace.rootSplit.children[0] ) {
						item12.setTitle('Toggle Semi-Compact Mode')
						.setIcon('semiCompactMode')
						.setChecked( tab_group_classList?.contains('is_semi_compact_mode') ? true : false )
						.onClick(async () => {
							toggleContinuousMode([tab_group_id] || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@2');
						})
					}
				})
				.addItem( (item12) => {
					if ( tab_group === workspace.rootSplit.children[0] ) {
						item12.setTitle('Toggle Compact Mode')
						.setIcon('compactMode')
						.setChecked( tab_group_classList?.contains('is_compact_mode') ? true : false )
						.onClick(async () => {
							toggleContinuousMode([tab_group_id] || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@1');
						})
					}
				})
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
				.addItem((item5) => {
					item5.setTitle('Sort by file name (A to Z)')
					.setIcon('arrowDownAZ')
					.setChecked( tab_group_el?.dataset?.sort_order === 'alphabetical' ? true : false )
					.onClick(async () => { 
						sortItems(tab_group_id,'alphabetical');
					})
				})
				.addItem((item6) => {
					item6.setTitle('Sort by file name (Z to A)')
					.setIcon('arrowDownZA')
					.setChecked( tab_group_el?.dataset?.sort_order === 'alphabeticalReverse' ? true : false )
					.onClick(async () => { 
						sortItems(tab_group_id,'alphabeticalReverse');
					})
				})
				.addItem((item7) => {
					item7.setTitle('Sort by modified time (new to old)')
					.setIcon('arrowDown10')
					.setChecked( tab_group_el?.dataset?.sort_order === 'byModifiedTime' ? true : false )
					.onClick(async () => { 
						sortItems(tab_group_id,'byModifiedTime');
					})
				})
				.addItem((item8) => {
					item8.setTitle('Sort by modified time (old to new)')
					.setIcon('arrowDown01')
					.setChecked( tab_group_el?.dataset?.sort_order === 'byModifiedTimeReverse' ? true : false )
					.onClick(async () => { 
						sortItems(tab_group_id,'byModifiedTimeReverse');
					})
				})
				.addItem((item9) => {
					item9.setTitle('Sort by created time (new to old)')
					.setIcon('arrowDown10')
					.setChecked( tab_group_el?.dataset?.sort_order === 'byCreatedTime' ? true : false )
					.onClick(async () => { 
						sortItems(tab_group_id,'byCreatedTime');
					})
				})
				.addItem((item10) => {
					item10.setTitle('Sort by created time (old to new)')
					.setIcon('arrowDown01')
					.setChecked( tab_group_el?.dataset?.sort_order === 'byCreatedTimeReverse' ? true : false )
					.onClick(async () => { 
						sortItems(tab_group_id,'byCreatedTimeReverse');
					})
				})
		}
		// add change sort order menu items
		const addChangeSortOrderMenuItems = (item,tab_group,tab_group_el,tab_group_classList) => {
			item.setTitle('Change sort order')
				.setIcon('arrow-up-narrow-wide')
				.setDisabled( tab_group?.children?.length > 1 && tab_group_classList?.contains('is_continuous_mode') ? false : true )
				.setSubmenu()
					.addItem((item5) => {
					item5.setTitle('File name (A to Z)')
						.setIcon('arrowDownAZ')
						.setChecked( tab_group_el?.dataset?.sort_order === 'alphabetical' ? true : false )
						.onClick(async () => { 
							sortItems(tab_group_id,'alphabetical');
						})
					})
					.addItem((item6) => {
						item6.setTitle('File name (Z to A)')
						.setIcon('arrowDownZA')
						.setChecked( tab_group_el?.dataset?.sort_order === 'alphabeticalReverse' ? true : false )
						.onClick(async () => { 
							sortItems(tab_group_id,'alphabeticalReverse');
						})
					})
					.addSeparator()
					.addItem((item7) => {
						item7.setTitle('Modified time (new to old)')
						.setIcon('arrowDown10')
						.setChecked( tab_group_el?.dataset?.sort_order === 'byModifiedTime' ? true : false )
						.onClick(async () => { 
							sortItems(tab_group_id,'byModifiedTime');
						})
					})
					.addItem((item8) => {
						item8.setTitle('Modified time (old to new)')
						.setIcon('arrowDown01')
						.setChecked( tab_group_el?.dataset?.sort_order === 'byModifiedTimeReverse' ? true : false )
						.onClick(async () => { 
							sortItems(tab_group_id,'byModifiedTimeReverse');
						})
					})
					.addSeparator()
					.addItem((item9) => {
						item9.setTitle('Created time (new to old)')
						.setIcon('arrowDown10')
						.setChecked( tab_group_el?.dataset?.sort_order === 'byCreatedTime' ? true : false )
						.onClick(async () => { 
							sortItems(tab_group_id,'byCreatedTime');
						})
					})
					.addItem((item10) => {
						item10.setTitle('Created time (old to new)')
						.setIcon('arrowDown01')
						.setChecked( tab_group_el?.dataset?.sort_order === 'byCreatedTimeReverse' ? true : false )
						.onClick(async () => { 
							sortItems(tab_group_id,'byCreatedTimeReverse');
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
			if ( this.app.isMobile === true ) {
				openItemsInContinuousModeMenuItems(open_links_menu,files,'query block links',open_links_menu,'links-menu')
			} else {
				open_links_menu.addItem( item => openItemsInContinuousModeMenuItems(item,files,'query block links'),undefined,'links-menu' );
			}
			open_links_menu.showAtMouseEvent(e);
		}
		// open items in continuous mode menu items
		const addMobileOpenInContinuousModeItems = (item,file,type,menu) => {
			menu.addItem((item6) => {
				item6.setTitle('CM: Append '+type+' in active tab group')
				.setIcon('appendFolder')
				.onClick(async () => { openItemsInContinuousMode(file,'append',type); })
			})
			.addItem((item7) => {
				item7.setTitle('CM: Replace active tab group with '+type)
				.setIcon('replaceFolder')
				.onClick(async () => { openItemsInContinuousMode(file,'replace',type) })
			})
			.addItem((item2) => {
				item2.setTitle('CM: Open '+type+' in new split left')
				.setIcon('panel-left-close')
				.onClick(async () => { openItemsInContinuousMode(file,'open_left',type); })
			})
			.addItem((item3) => {
				item3.setTitle('CM: Open '+type+' in new split right')
				.setIcon('panel-right-close')
				.onClick(async () => { openItemsInContinuousMode(file,'open_right',type); })
			})
			.addItem((item5) => {
				item5.setTitle('CM: Open '+type+' in new split up')
				.setIcon('panel-top-close')
				.onClick(async () => { openItemsInContinuousMode(file,'open_up',type); })
			})
			.addItem((item4) => {
				item4.setTitle('CM: Open '+type+' in new split down')
				.setIcon('panel-bottom-close')
				.onClick(async () => { openItemsInContinuousMode(file,'open_down',type); })
			})
			.addItem((item8) => {
				item8.setTitle('CM: Append '+type+' in Compact Mode')
				.setIcon('compactMode')
				.onClick(async () => { openItemsInContinuousMode(file,'append_compact_mode',type) })
			})
			.addItem((item9) => {
				item9.setTitle('CM: Replace Compact Mode with '+type)
				.setIcon('compactMode')
				.onClick(async () => { openItemsInContinuousMode(file,'replace_compact_mode',type) })
			})
			.addItem((item10) => {
				item10.setTitle('CM: Append '+type+' in Semi-compact Mode')
				.setIcon('compactMode')
				.onClick(async () => { openItemsInContinuousMode(file,'append_semi_compact_mode',type) })
			})
			.addItem((item11) => {
				item11.setTitle('CM: Replace Semi-compact Mode with '+type)
				.setIcon('compactMode')
				.onClick(async () => { openItemsInContinuousMode(file,'replace_semi_compact_mode',type) })
			})
		}
		const addDesktopOpenInContinuousModeItems = (item,file,type,menu) => {
			item.setTitle('Continuous Mode')
				.setIcon('scroll-text')
				.setSection( 'open')
				.setSubmenu()
					.addItem((item6) => {
						item6.setTitle('Append '+type+' in active tab group')
						.setIcon('appendFolder')
						.onClick(async () => { openItemsInContinuousMode(file,'append',type); })
					})
					.addItem((item7) => {
						item7.setTitle('Replace active tab group with '+type)
						.setIcon('replaceFolder')
						.onClick(async () => { openItemsInContinuousMode(file,'replace',type) })
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
						item8.setTitle('Append '+type+' in Compact Mode')
						.setIcon('compactMode')
						.onClick(async () => { openItemsInContinuousMode(file,'append_compact_mode',type) })
					})
					.addItem((item9) => {
						item9.setTitle('Replace Compact Mode with '+type)
						.setIcon('compactMode')
						.onClick(async () => { openItemsInContinuousMode(file,'replace_compact_mode',type) })
					})
					.addItem((item10) => {
						item10.setTitle('Append '+type+' in Semi-compact Mode')
						.setIcon('compactMode')
						.onClick(async () => { openItemsInContinuousMode(file,'append_semi_compact_mode',type) })
					})
					.addItem((item11) => {
						item11.setTitle('Replace Semi-compact Mode with '+type)
						.setIcon('compactMode')
						.onClick(async () => { openItemsInContinuousMode(file,'replace_semi_compact_mode',type) })
					})
		}
		const openItemsInContinuousModeMenuItems = (item,file,type,menu,source) => {
			type = ( type !== undefined ? type : file instanceof obsidian.TFolder ? 'folder contents' : file instanceof obsidian.TFile ? 'file' : null );
			file = ( file instanceof obsidian.TFile ? [file] : file instanceof obsidian.TFolder ? file.children : file );
			if ( this.app.isMobile === true && /file-explorer-context-menu|link-context-menu|links-menu/.test(source) ) { 
				addMobileOpenInContinuousModeItems(item,file,type,menu);
			} else {
				addDesktopOpenInContinuousModeItems(item,file,type,menu);
			}
		}
		/*-----------------------------------------------*/
		// OTHER PLUG-INS SUPPORT
		// Longform async
		const getLongformItems = (object) => {																											// object = mousedown event or file
			let longform_explorer = workspace.getLeavesOfType('VIEW_TYPE_LONGFORM_EXPLORER')[0].view.contentEl.children[0];
			let longform_scenes_arr = Array.from(longform_explorer.querySelectorAll('#scene-list > ul > li'));
			let target_item, filtered_items, paths = [];
			let kind = ( object.target?.classList.contains('current-draft-path') ? 'project' : 'scenes' );
			const open_longform_menu = new obsidian.Menu(); 
			switch(kind) {
				case 'project': 
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
						addContinuousModeMenuItem(item,this.app.appId +'_'+ editor?.editorComponent.owner.leaf.parent.id,)								// add continuous mode items
						if ( links.length > 0 ) { openItemsInContinuousModeMenuItems(item,files,'document links'); }										// add open document links items
					});
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu,file,source,leaf) => {																				// on file-menu
				let items, links, files;
				switch(true) {
					case (/link-context-menu/.test(source)):																							// click link
						menu.addItem((item) => { 
							openItemsInContinuousModeMenuItems(item,file,'link',menu,source);															// add open link items
						});																														break;
					case (/file-explorer-context-menu/.test(source)):																					// link context menu/file-explorer menu
						menu.addItem((item) => { 
							openItemsInContinuousModeMenuItems(item,file,undefined,menu,source);														// add open files items
						});																														break;
					case (/file-explorer/.test(source)):																								// file-tree-alternative plugin support
						if ( this.app.workspace.getActiveViewOfType(obsidian.View).leaf === this.app.workspace.getLeavesOfType('file-tree-view')[0] ) {
							menu.addItem((item) => { 
								openItemsInContinuousModeMenuItems(item,file,undefined,menu,source);
							});
						}																														break;
					case (/longform/.test(source)):																										// longform plugin support
						items = getLongformItems(file,'scenes');
						menu.addItem((item) => { 
							openItemsInContinuousModeMenuItems(item,items,'Longform scenes',menu,source)
						});																														break;
					default: 
						menu.addItem((item) => {																										// file menu
							links = getDocumentLinks(file,leaf), files = getFilesFromLinks(links);
							addContinuousModeMenuItem(item,this.app.appId +'_'+ leaf.parent.id, leaf, links)											// add continuous mode items
							if ( links.length > 0 && leaf.containerEl.closest('.mod-sidedock') === null ) {
								openItemsInContinuousModeMenuItems(item,files,'document links',menu,source);											// add open document links items
							}
						});																														break;
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on('files-menu', (menu,files,source) => {																				// on files-menu
				switch(true) {
					case (/link-context-menu|file-explorer-context-menu/.test(source)):																	// open selected files in CM
						menu.addItem((item) => { openItemsInContinuousModeMenuItems(item,files,'selected files'),menu,source });							break;
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on('leaf-menu', (menu,leaf) => {																							// on leaf-menu (e.g. sidebar tab headers)
				if ( leaf !== workspace.getActiveViewOfType(obsidian.View).leaf ) { workspace.setActiveLeaf(leaf,{focus:true}); }
				if ( leaf.containerEl.closest('.mod-left-split,.mod-right-split') ) {
					menu.addItem((item) => { addContinuousModeMenuItem(item,this.app.appId +'_'+ leaf.parent.id,leaf ) });
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
					openItemsInContinuousModeMenuItems(item,files,'search results',menu);
				})
			})
		);
		// OTHER EVENTS
		/*-----------------------------------------------*/
		// INITIALIZE CONTINUOUS MODE 
		let init_CM = true;
		workspace.onLayoutReady( () => {
			toggleContinuousMode(this.settings.tabGroupIds,init_CM);		init_CM = false;		// restore continuous mode onload; update after initial load
		});
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				toggleContinuousMode(this.settings.tabGroupIds,init_CM);
			})
		);
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (e) => {
				if ( workspace.getActiveViewOfType(obsidian.View).getViewType() === 'file-explorer' ) {
					scrollItemsIntoView(null,workspace.getMostRecentLeaf().containerEl);				// scroll into view when selecting items in file explorer (compatibility with "smooth-explorer")
				}
			})
		);
		/*-----------------------------------------------*/
		// ADD COMMAND PALETTE ITEMS		
		['active','left','right','root'].forEach( side => {												// add commands: toggle continuous mode in active tab group, left/right sidebars
			const toggleCM = (tab_group) => { 
				toggleContinuousMode([this.app.appId +'_'+ tab_group.id],false,'@0') 
			}
			this.addCommand({
				id: 	( side === 'active' ? 'toggle-continuous-mode-active' : side === 'root' ? 'toggle-continuous-mode-in-root-tab-groups' : 'toggle-continuous-mode-in-'+side+'-sidebar' ),
				name:	( side === 'active' ? 'Toggle Continuous Mode in active tab group' : side === 'root' ? 'Toggle Continuous Mode in root tab groups' : 'Toggle Continuous Mode in '+side+' sidebar'),
				callback: () => {
					switch(side) {
						case 'left':	getAllTabGroups('left').forEach( tab_group => toggleCM(tab_group) );		break;
						case 'right':	getAllTabGroups('right').forEach( tab_group => toggleCM(tab_group) );		break;
						case 'root':	getAllTabGroups('root').forEach( tab_group => toggleCM(tab_group) );		break;
						default: 		toggleCM(workspace.activeTabGroup); 
					}
				}
			});
			this.addCommand({																			// add command: toggle display of leaf headers
				id: 	( side === 'active' ? 'toggle-headers-active-tab-group' : side === 'root' ? 'toggle-headers-in-root-tab-groups' : 'toggle-headers-in-'+side+'-sidebar' ),
				name:	( side === 'active' ? 'Toggle visibility of note titles in active tab group' : side === 'root' ? 'Toggle visibility of note titles in root tab groups' : 'Toggle visibility of note titles '+side+' sidebar' ),
				callback: () => {
					switch(side) {
						case 'left':	workspace.leftSplit.containerEl.querySelectorAll('.workspace-tabs').forEach( tab_group => tab_group.classList.toggle('hide_note_titles') );		break;
						case 'right':	workspace.rightSplit.containerEl.querySelectorAll('.workspace-tabs').forEach( tab_group => tab_group.classList.toggle('hide_note_titles') );	break;
						case 'root':	workspace.rootSplit.containerEl.querySelectorAll('.workspace-tabs').forEach( tab_group => tab_group.classList.toggle('hide_note_titles') );		break;
						default: 		workspace.activeTabGroup.containerEl.classList.toggle('hide_note_titles');
					}
				},
			});
		});
		this.addCommand({																				// add command: toggle compact mode
			id: 	( 'toggle-compact-mode'),
			name:	( 'Toggle compact mode' ),
			callback: () => { toggleContinuousMode([this.app.appId +'_'+ workspace.rootSplit?.children[0]?.id],false,'@1') }
		});
		this.addCommand({																				// add command: toggle semi-compact mode
			id: 	( 'toggle-semi-compact-mode'),
			name:	( 'Toggle semi-compact mode' ),
			callback: () => { toggleContinuousMode([this.app.appId +'_'+ workspace.rootSplit?.children[0]?.id],false,'@2') }
		});
		['left','right','up','down','append','replace'].forEach( action => {							// add commands: open selected file explorer items in Continuous Mode
			this.addCommand({
				id: 'open-folder-in-new-split-'+action,
				name: 'Open selected file explorer item in new split '+action,
				callback: () => {
					let items = workspace.getLeavesOfType('file-explorer')[0].view.tree.focusedItem?.file?.children || workspace.getLeavesOfType('file-explorer')[0].view.tree?.focusedItem?.file || workspace.getLeavesOfType('file-explorer')[0].view.tree?.activeDom?.file;
					if ( !items ) { 
						alert('Continuous Mode:\nNo file explorer item selected') 
					} else {
						setPinnedLeaves();
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
							case type === 'document links': items = getFilesFromLinks(getDocumentLinks(workspace.getActiveViewOfType(obsidian.View).leaf.view.file,workspace.getActiveViewOfType(obsidian.View).leaf)) || void 0;	break;
							case type === 'search results': items = getFilesFromSearchResults();													break;
						}
						setPinnedLeaves();
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
						alert('Continuous Mode:\nActive tab group is not in continuous mode.');
					}
				}
			});
		});
		['previous','next'].forEach( direction => {
			this.addCommand({
				id: 'open-'+ direction +'-file-explorer-item-in-place',
				name: 'Open '+ direction +' File Explorer item in place',
				callback: () => {
					navigateInPlace(null,( direction === 'previous' ? 'backwards' : 'forwards'))
				}
			});
		});
    } 
    // end onload
	/*-----------------------------------------------*/
    // on plugin unload
	onunload() {
		let tab_groups = this.app.workspace.containerEl.querySelectorAll('.workspace-tabs');
		tab_groups.forEach( 
			el => {
				el?.classList?.remove('is_continuous_mode','hide_note_titles','is_compact_mode','is_semi_compact_mode','only_show_file_name','is_enable_scroll','is_smooth_scroll','is_typewriter_scroll');
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
		new obsidian.Setting(containerEl).setName('Include base files').setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.includedFileTypes.includes('base'))
			.onChange(async (value) => {
				(value === true ? this.plugin.settings.includedFileTypes.push('base') : this.plugin.settings.includedFileTypes.splice(this.plugin.settings.includedFileTypes.indexOf('base'),1));
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
        new obsidian.Setting(containerEl).setName('Allow single click to open File Explorer items in Continuous Mode').setDesc('Enable this setting to make it possible to open the items in the File Explorer with a single click. Set the default single click action below.')
        	.addToggle( (A) => A.setValue(this.plugin.settings.allowSingleClickOpenFolder)
        	.onChange(async (value) => {
        		this.plugin.settings.allowSingleClickOpenFolder = value;
        		await this.plugin.saveSettings();
        }));
		new obsidian.Setting(containerEl).setName('Set default single-click action:').setClass("cm-setting-indent").setClass('hidden')
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
		new obsidian.Setting(containerEl).setName('Maximum number of items to open at one time').setDesc('Leave empty (or set to 0) to open all items at once. Otherwise, setting a value here allows you to incrementally open the items in a folder (or search results or document links) by repeatedly selecting “Append items in Continuous Mode.” Useful for dealing with folders containing a large number of items. (Note: The “single click” action above must be set to one of the “Append” options.)')
			.addText((A) => A.setPlaceholder("").setValue(this.plugin.settings.maximumItemsToOpen?.toString() || '0')
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
		new obsidian.Setting(containerEl).setName('Index files at top').setDesc('If the directory contains an “index.md” file or a file with the same name as the directory itself, place it at the top of the opened files, regardless of the sort order.').setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.indexFilesAtTop)
			.onChange(async (value) => {
				this.plugin.settings.indexFilesAtTop = value;
				await this.plugin.saveSettings();
		}));

        this.containerEl.createEl("h2", { text: 'About Compact Mode and Semi-Compact Mode' });
        this.containerEl.createEl("div", {text: 'Compact and Semi-Compact Mode show previews of your notes in the left split, similar to the second side-pane previews in apps like Evernote, Bear Notes, Simplenote, Apple Notes, etc. Notes can be navigated up and down with the arrow keys as in Continuous Mode, but in Compact Mode, the selected note will be opened in the right split; in Semi-Compact Mode, the selected note will be expanded in place for editing, leaving the other notes in compact view.', cls: 'setting-item-description' });
        this.containerEl.createEl("div", {text: '(Note: You may wish to disable the Obsidian editor setting “Always focus new tabs” to allow continuous arrow navigation of Compact Mode items.)', cls: 'setting-item-description' });
        this.containerEl.createEl("h2", { text: "Other Settings" });
		new obsidian.Setting(containerEl).setName('Allow Continuous Mode navigate in place:').setDesc('If this setting is enabled, using the arrow up/down keys when the cursor is in the first or last line respectively of the active editor will open the previous or next file (as listed in the File Explorer) in the same tab.')
			.addToggle( A => A.setValue(this.plugin.settings.navigateInPlace)
			.onChange(async (value) => {
				this.plugin.settings.navigateInPlace = value;
				await this.plugin.saveSettings();
		}));
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
		new obsidian.Setting(containerEl).setName('Enable scroll-into-view').setDesc('Prevent auto-scrolling of leaves, tab headers, etc. when clicked, when typing in the active editor, or when using the arrow keys.')
			.addToggle( A => A.setValue(this.plugin.settings.enableScrollIntoView)
			.onChange(async (value) => {
				this.plugin.settings.enableScrollIntoView = value;
				let tab_groups = this.app.workspace.rootSplit.containerEl.querySelectorAll('.workspace-tabs.is_continuous_mode');
				if ( value === true ) {
					tab_groups?.forEach( tab_group => {
						tab_group.classList?.add('is_enable_scroll');
						if ( this.plugin.settings.enableSmoothScroll === true ) { tab_group => tab_group.classList?.add('is_smooth_scroll') }
						if ( this.plugin.settings.enableTypewriterScroll === true ) { tab_group => tab_group.classList?.add('is_typewriter_scroll') }
					})
				} else {
					tab_groups?.forEach( tab_group => tab_group.classList?.remove('is_enable_scroll','is_smooth_scroll','is_typewriter_scroll') )
				}
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Use smooth scrolling').setClass("cm-setting-indent").setClass('hidden').setDesc('Only available when scroll-into-view is enabled.')
			.addToggle( A => A.setValue(this.plugin.settings.enableSmoothScroll)
			.onChange(async (value) => {
				this.plugin.settings.enableSmoothScroll = value;
				let tab_groups = this.app.workspace.rootSplit.containerEl.querySelectorAll('.workspace-tabs.is_continuous_mode');
				if ( value === true ) {
					tab_groups?.forEach( tab_group => tab_group.classList?.add('is_smooth_scroll') )
				} else {
					tab_groups?.forEach( tab_group => tab_group.classList?.remove('is_smooth_scroll') )
				}
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Enable typewriter scrolling').setClass("cm-setting-indent").setClass('next-hidden').setDesc('Only available when scroll-into-view is enabled.')
			.addToggle( A => A.setValue(this.plugin.settings.enableTypewriterScroll)
			.onChange(async (value) => {
				this.plugin.settings.enableTypewriterScroll = value;
				let tab_groups = this.app.workspace.rootSplit.containerEl.querySelectorAll('.workspace-tabs.is_continuous_mode');
				if ( value === true ) {
					tab_groups?.forEach( tab_group => tab_group.classList?.add('is_typewriter_scroll') )
				} else {
					tab_groups?.forEach( tab_group => tab_group.classList?.remove('is_typewriter_scroll') )
				}
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
