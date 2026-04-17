/* jshint esversion: 6 */

'use strict';

let obsidian = require('obsidian');

let DEFAULT_SETTINGS = {
	'allowSingleClickOpenFolder': 		false,
	'allowSingleClickOpenFolderAction':	'disabled',
	'alwaysHideNoteHeaders':			false,
	'defaultSortOrder':					'alphabetical',
	'enableScrollIntoView':				true,
	'enableSmoothScroll':				true,
	'enableTypewriterScroll':			true,
	'excludedNames':					[],
	'extraFileTypes':					[],
	'hideTabBar':						false,
	'includeBlockLinks':				false,
	'includeEmbeddedFiles':				false,
	'includedFileTypes':				['markdown'],
	'indexFilesAtTop':					true,
	"maximumItemsToOpen":				'0',
	'navigateInPlace':					false,
	'onlyShowFileName':					false,
	'openFoldersRecursively':			false,
	'tabGroupIds':						[],
	'warnOnReplace':					false
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
						case (/root/i.test(split)) && leaf.getRoot() !== workspace.rootSplit:												// do nothing
						case (/left/i.test(split)) && leaf.getRoot() !== workspace.leftSplit:												// do nothing
						case (/right/i.test(split)) && leaf.getRoot() !== workspace.rightSplit:										break;	// do nothing
						case (/root/i.test(split)) && leaf.getRoot() === workspace.rootSplit:												// get root tab groups only
						case (/left/i.test(split)) && leaf.getRoot() === workspace.leftSplit:												// get root tab groups only
						case (/right/i.test(split)) && leaf.getRoot() === workspace.rightSplit:		tab_groups.push(leaf.parent);	break;	// get root tab groups only
						default:																	tab_groups.push(leaf.parent);	break;	// get all tab groups
					} 
				}
			)
			return [...new Set(tab_groups)];
		}
		const getTabGroupById = (id) =>		{ return getAllTabGroups()?.find( tab_group => tab_group.id === id ); }							// get tab group by id, not dataset-tab-group-id
		const getTabHeaderIndex = (e) =>	{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
		const getFileExplorerItems = (e) => {																								// get the files in their exact File Explorer order
			let type = ( /folder/.test(e.target.className) ? 'folder' : 'file' ), explorer_items, items = [], returned_items = [];
			let collapsed = !e.target.closest('.nav-folder.tree-item')?.querySelector('.tree-item-children.nav-folder-children');
			let recursive = this.settings.openFoldersRecursively, sort_order = this.settings.defaultSortOrder;
			switch(type) {
				case 'folder':															// get folder items according to collapsed state and recursive & sort order settings
					switch(true) {
						case !collapsed && recursive && sort_order === 'fileExplorer':	// open visible items recursively in file explorer order
							explorer_items = e.target.closest('.nav-folder.tree-item')?.querySelector('.tree-item-children.nav-folder-children')?.querySelectorAll('.tree-item.nav-file');	break;
						case collapsed && recursive && sort_order === 'fileExplorer':	// open collapsed items in alphabetical order instead of File Explorer order
						case collapsed && recursive && sort_order !== 'fileExplorer':	// open all items recursively in sort order															// nobreak
						case !collapsed && recursive && sort_order !== 'fileExplorer':	// open all items recursively in sort order
							items = this.app.vault.getFolderByPath(e.target.closest('.nav-folder.tree-item')?.querySelector('.tree-item-self.nav-folder-title').dataset.path).children;
							items = getFileExplorerItemsRecursively(items,returned_items);																									break;
						case !collapsed && !recursive && sort_order === 'fileExplorer':	// open top level items in file explorer order														// nobreak
						case !collapsed && !recursive && sort_order !== 'fileExplorer':	// original default behavior: open top-level items only in sort order
							items = this.app.vault.getFolderByPath(e.target.closest('.nav-folder.tree-item')?.querySelector('.tree-item-self.nav-folder-title').dataset.path).children;		break;
					}																																										break;
				case 'file':   explorer_items = [e.target.closest('.nav-file-title.tree-item-self')];																						break;
			}
			if ( explorer_items !== undefined ) { 
				explorer_items?.forEach( explorer_item => items.push( this.app.vault.getFileByPath(explorer_item?.querySelector('.nav-file-title')?.dataset?.path || explorer_item?.dataset?.path) ) );
			}	
			return items;
		}
		const getFileExplorerItemsRecursively = (items,returned_items) => {
			Array.from(items).forEach( item => {
				switch(true) {
					case item instanceof obsidian.TFolder: getFileExplorerItemsRecursively(item.children,returned_items);  	break;
					case item instanceof obsidian.TFile: returned_items.push(item);											break;	// if item is file, add item
				}
			})
			return returned_items;
		}		
		const getActiveEditor = () =>		{ return workspace.activeEditor?.editor; }
		const getActiveCursor = () =>		{ return getActiveEditor()?.getCursor('anchor'); }
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
			let files = [];
			if ( workspace.getLeavesOfType('search')[0] && workspace.getLeavesOfType('search')[0].view?.dom?.vChildren?._children ) {
				workspace.getLeavesOfType('search')[0].view.dom.vChildren._children.forEach( item => files.push(item.file) )
			}
			return files
		}
		const scrollBehavior = () => { return ( this.settings.enableSmoothScroll === false || this.settings.enableScrollIntoView === false ? 'instant' : 'smooth' ); }
		const scrollBlock = (e) => { return ( e?.key === 'ArrowUp' ? 'end' : e?.key === 'ArrowDown' ? 'start' : 'center' ) }
		/*-----------------------------------------------*/
		// Sort Items
		const compareArrs = (arr1,arr2) => {																									// check if arrays contain exactly the same elements
			if (arr1.length !== arr2.length) { return false; }
			let sorted_arr1 = arr1.sort(), sorted_arr2 = arr2.sort();
			for (let i = 0; i < sorted_arr1.length; i++ ) {
				if ( sorted_arr1[i] !== sorted_arr2[i] ) { return false }
			}
			return true;
		}
		const getSortOrder = (type) => {
			let sort_order = 																																	// get sort order
				/fileExplorer|alphabetical|alphabeticalReverse|byModifiedTime|byModifiedTimeReverse|byCreatedTime|byCreatedTimeReverse/i.test(type) ? type
				: workspace.getLeavesOfType('file-explorer')[0].view.sortOrder === 'custom' ? 'none'
				: /search|links|longform/i.test(type) ? 'none'							 																		// open links, etc. in listed order
				: this.settings.defaultSortOrder !== undefined && this.settings.defaultSortOrder !== 'disabled' ? this.settings.defaultSortOrder				// use default sort order from settings
				: this.settings.defaultSortOrder === undefined || this.settings.defaultSortOrder === 'disabled' ? workspace.getLeavesOfType('file-explorer')[0].view.sortOrder 
				: 'alphabetical';
			return sort_order;
		}
		const sortItemsByOrder = (e,items,sort_order) => {
			let sorted = [];
			if ( e === undefined || e.target.closest('.tree-item.nav-folder').querySelector('.tree-item-children.nav-folder-children') === null ) { 
				sort_order = sort_order === 'fileExplorer' ? 'alphabetical' : sort_order;
			}
			switch(sort_order) {
				case 'alphabetical':			
					sorted = items.toSorted((a,b) => (a.parent.path+'/'+a.basename).localeCompare((b.parent.path+'/'+b.basename),navigator.language,{numeric:true}));	break;
				case 'alphabeticalReverse':
					sorted = items.toSorted((a,b) => (b.parent.path+'/'+b.basename).localeCompare((a.parent.path+'/'+a.basename),navigator.language,{numeric:true}));	break;
				case 'byModifiedTime':			
					sorted = items.toSorted((a,b) => (b.stat?.mtime) - (a.stat?.mtime));									break;
				case 'byModifiedTimeReverse':	
					sorted = items.toSorted((a,b) => (a.stat?.mtime) - (b.stat?.mtime));									break;
				case 'byCreatedTime':			
					sorted = items.toSorted((a,b) => (b.stat?.ctime) - (a.stat?.ctime));									break;
				case 'byCreatedTimeReverse':	
					sorted = items.toSorted((a,b) => (a.stat?.ctime) - (b.stat?.ctime));									break;
				case 'fileExplorer':	case 'none':	sorted = items;														break;	// no sort
			}
			if ( this.settings.indexFilesAtTop === true && sort_order !== 'none' ) {																// if index files on top setting...
				let index = sorted.filter( item => ( /^index$/im.test(item.basename) || /^item.basename$/im.test(item.parent.name) ) ); 			// find index files
				let nonindex = sorted.filter( item => ( !/^index$/im.test(item.basename) ) ); 														// find non-index files
				sorted = [...index,...nonindex];																									// concatenate
			}
			return sorted;
		}
		const changeSortOrder = (tab_group_id,sort_order) => {																							// manually change sort order
			sort_order = getSortOrder(sort_order);												// set data-sort_order
		 	let active_tab_group = getTabGroupById(tab_group_id?.split('_')[1]);
		 	let items = active_tab_group.children, sorted = [];
		 	if ( items === null ) { return }
		 	items.forEach( item => sorted.push(item.view.file) );
			openItemsInContinuousMode(sorted,'replace',sort_order);
		};
		const prepItems = (e,items,action,type,recent_leaf) => {															// filter, dedupe, sort, move items before opening
			if ( this.settings.openFoldersRecursively === true ) { items = getFileExplorerItemsRecursively(items,[]) }
			let sort_order = getSortOrder(type), extensions, included_extensions = [], open_files = [], found;
			workspace.activeTabGroup.containerEl.dataset.sort_order = sort_order;											// set data-sort_order
			extensions = { 
				markdown:	['md'],
				base:		['base'],
				images:		['avif','bmp','jpg','jpeg','gif','png','svg','webp'],
				canvas:		['canvas'],
				media:		['aac','aif','aiff','ape','flac','m4a','mka','mp3','ogg','opus','wav','m4v','mkv','mov','mp4','mpeg','webm'],
				pdf:		['pdf']
			};
			for (const [key, value] of Object.entries(extensions)) { if ( this.settings.includedFileTypes.includes(key) ) { included_extensions.push(value); } }	// get included extensions
			included_extensions = included_extensions.concat(this.settings.extraFileTypes).flat(Infinity).map( ext => ext.trim() );									// get extra extensions, trim, flatten
			items = items.filter( 
				item => item instanceof obsidian.TFile 																												// item must be TFile
				&& included_extensions.includes( item.extension ) 																									// remove items included by extension
				&& !this.settings.excludedNames.includes( item.basename +'.'+ item.extension )																		// remove items excluded by name
			);
			recent_leaf.parent?.children.forEach( leaf => open_files.push( leaf.view.file ) );																		// get open files for comparison
			switch(true) {
				case ( !/alphabetical|time|file/i.test(type) && /append|replace/.test(action) && compareArrs(items,open_files) ):		items = [];			break;	// items === open files => do nothing
				case ( /append/.test(action) && items.length === 1 ):
					found = recent_leaf.parent?.children.find( (leaf) => leaf.view.file === items[0] );
					if ( found ) { workspace.setActiveLeaf(found,{focus:true}); items = found }																break;
				case ( !/replace|up|down|left|right/.test(action) ):
					recent_leaf.parent?.children.forEach( (leaf) => { items = items.filter( item => item !== leaf.view.file) } );							break;	// filter items to prevent dupe leaves
			}
			items = sortItemsByOrder(e,items,sort_order);																											// sort items
			return items;
		}
		/*-----------------------------------------------*/
		// HOUSEKEEPING
		const setPinnedLeaves = (action) => {
			workspace.iterateAllLeaves( leaf => {
				switch(true) {
					case action === 'replace' && leaf.containerEl.closest('.mod-root'): 
					case leaf.view.getViewType() === 'empty': 																					break;	// don't pin empty leaves
					case leaf.pinned === false: 
						leaf.containerEl.classList.add('temp_pinned'); leaf.tabHeaderEl.classList.add('temp_pinned'); leaf.setPinned(true);		break;	// pin all unpinned leaves, add class
					case leaf.pinned === true: 	leaf.containerEl.classList.add('pinned');														break;	// add class for originally pinned leaves
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
			if ( !Array.isArray(tab_group_ids) ) { tab_group_ids = [tab_group_ids] }
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
 							case ( /@0/.test(mode) ):
								tab_group?.containerEl?.classList?.remove('is_compact_mode','is_semi_compact_mode');									// remove compact mode classes
								tab_group?.containerEl?.classList?.toggle('is_continuous_mode');												break;	// add continuous mode class
 							case ( /@1/.test(mode) ):
 								switch(true) {
									case ( /is_semi_compact_mode/.test(class_names) ): 
										tab_group?.containerEl?.classList?.remove('is_semi_compact_mode');
										tab_group?.containerEl?.classList?.add('is_compact_mode');												break;	// toggle compact mode classes
									case ( /is_compact_mode/.test(class_names) ):
										tab_group?.containerEl?.classList?.remove('is_compact_mode');											break;	// remove compact mode class
									default:										
										tab_group?.containerEl?.classList?.add('is_continuous_mode','is_compact_mode');	compact_mode = true;			// add compact mode classes	
 									}																											break;
 							case ( /@2/.test(mode) ):
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
				if ( this.settings.hideTabBar === true ) { tab_group?.containerEl?.classList?.add('hide_tab_bar'); }							// hide tab bar
				if ( this.settings.alwaysHideNoteHeaders === true && !tab_group?.containerEl?.classList?.contains('show_note_titles') ) {
					tab_group?.containerEl?.classList?.add('hide_note_titles');	tab_group?.containerEl?.classList?.remove('show_note_titles');	// hide note headers
				} else {
					tab_group?.containerEl?.classList?.add('show_note_titles');	tab_group?.containerEl?.classList?.remove('hide_note_titles');	// show note headers
				}
				if ( this.settings.enableScrollIntoView === false )		{ tab_group?.containerEl?.classList?.add('is_enable_scroll') }			// enable scroll into view
				if ( this.settings.enableSmoothScroll === true )		{ tab_group?.containerEl?.classList?.add('is_smooth_scroll') }			// enable smooth scroll
				if ( this.settings.enableTypewriterScroll === true )	{ tab_group?.containerEl?.classList?.add('is_typewriter_scroll') }		// enable typewriter scroll
				if ( this.settings.onlyShowFileName === true )			{ tab_group?.containerEl?.classList?.add('only_show_file_name'); }		// enable show file name
				if ( tab_group && tab_group.containerEl.classList.contains('is_continuous_mode') ) {
					tab_group.children?.forEach( leaf => {  if ( leaf.view.file?.path === undefined ) { return }
						let level = leaf.view.file.path.match(/\//g)?.length || 0;
						leaf.containerEl.dataset.cmlevel = level + 1;																			// add file folder level data for inline-title styling
					})
				} else if ( tab_group ) {
					tab_group.containerEl.querySelectorAll('.workspace-leaf[data-cmlevel]')?.forEach(leaf => delete leaf?.dataset?.cmlevel);	// delete file folder level data
				}
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
		const scrollTabHeader = () => {
			workspace.activeLeaf.tabHeaderEl.parentElement.scrollTo({left:(workspace.activeLeaf.tabHeaderEl.offsetLeft - workspace.activeLeaf.tabHeaderEl.offsetWidth),behavior:scrollBehavior()});
		}
		const scrollActiveLeaf = (e,leaf,block) => {
			leaf.containerEl.scrollIntoView({behavior:scrollBehavior(),block:(block || scrollBlock())})
			scrollTabHeader(e); 																										// scroll tab into view
		}
		const scrollActiveLeafContent = obsidian.debounce( (e,leaf) => {
			if ( this.settings.enableTypewriterScroll === false && leaf.view.getViewType() === 'markdown' ) { return }
			let offset = 0, el = leaf.containerEl;
			switch(true) {
				case ( /metadata-/.test(el?.className) ):																											// scroll metadata/properties
				case ( /metadata-/.test(e?.target?.className) ):																									// scroll metadata/properties
					switch(true) {
						case el !== undefined:	el.focus();
									workspace.activeTabGroup.tabsContainerEl.scrollTo(
										{ top:leaf.containerEl.offsetTop - workspace.activeTabGroup.tabHeaderContainerEl.offsetHeight 
										- leaf.containerEl.querySelector('.metadata-properties-heading').offsetTop 
										- workspace.activeTabGroup.containerEl.offsetHeight/2, behavior:scrollBehavior() });								break;
						default:	document.activeElement.scrollIntoView({behavior:scrollBehavior(),block:'center'});
					}																																		break;
				case leaf.view.tree && !!leaf.containerEl.querySelector('.tree-item-self.has-focus'):																// scroll tree items
					leaf.containerEl.querySelector('.tree-item-self.has-focus').scrollIntoView({behavior:scrollBehavior(),block:'center'});					break;
				default:																																			// typewriter scroll md editor
					offset = Math.abs( workspace.activeTabGroup.containerEl.querySelector('.workspace-tab-container').scrollTop ) 
									- workspace.activeTabGroup.containerEl.offsetHeight/2 
									+ (getActiveEditor()?.coordsAtPos(getActiveEditor()?.getCursor('anchor'))?.bottom || 0);
					workspace.activeTabGroup.containerEl.querySelector('.workspace-tab-container').scrollTo({top:offset,behavior:scrollBehavior()});
			}
		},10);
		const scrollItemsIntoView = (e,leaf,type,block) => {
			if ( !leaf || this.settings.enableScrollIntoView === false || !/is_continuous_mode/.test(leaf.parent.containerEl.className) ) 					{ return }
			switch(true) {
				case type === 'leaf' && leaf.view.getViewType() !== 'markdown' && !leaf.view.tree:		scrollActiveLeaf(e,leaf,block);						break;	// scroll non-md leaves
				default:																				scrollActiveLeafContent(e,leaf);							// scroll md content and trees
			}
		}
		// FOCUS NAVIGATED CONTENT
		const focusItems = (e,adjacent_leaf,increment,type) => {
			let new_view_type = ( adjacent_leaf.view.tree ? 'tree' : adjacent_leaf.view.getViewType() ), new_view_state = adjacent_leaf.getViewState()?.state;
			let new_active_editor = getActiveEditor(), new_active_tree = adjacent_leaf.view.tree?.containerEl, block, scroll_options = {preventScroll:true,focusVisible:true};
			let inline_title_visible = this.app.vault.config.showInlineTitle === true;
			let props_visible = ( this.app.vault.config.propertiesInDocument === 'hidden' ? false : true );
			switch(true) {
				case new_view_state?.mode === 'preview':				block = 'start';																										break;
				case new_view_type !== 'markdown':																												// focus other content
					switch(true) {
						case ( /tree/i.test(new_view_type) ): 			block = 'center';
							switch(true) {
								case increment === -1:	
									new_active_tree.querySelectorAll('.tree-item')[new_active_tree.querySelectorAll('.tree-item').length - 1]?.focus(scroll_options);	break;
								case increment === 1:	new_active_tree.querySelectorAll('.tree-item')[0]?.focus(scroll_options);										break;
							}																																			break;
						case ( /audio|video|canvas|graph|html|image|pdf/i.test(new_view_type) ):
							adjacent_leaf.containerEl.querySelectorAll('audio,video,iframe,img,.pdfViewer')[0]?.focus(scroll_options);
																		block = 'start';																				break;
						default:										block = 'start';																				break;
					}																																					break;
				case increment === -1 && type === 'leaf':	e.preventDefault();																					// prevent arrow up from EOF upon entry
																		block = 'nearest';	new_active_editor?.focus(scroll_options);											// focus editor
																		new_active_editor.setCursor({line:new_active_editor?.lastLine(),ch:new_active_editor?.lastLine()?.length - 1});			break;
				case increment === 1 && type === 'leaf':				block = 'nearest';
					switch(true) {
						case inline_title_visible:						adjacent_leaf.view.inlineTitleEl?.focus(scroll_options);										return;	// focus inline title
						case !inline_title_visible && props_visible:	adjacent_leaf.view.metadataEditor.headingEl?.focus(scroll_options);								return;	// focus props header
						default: 										new_active_editor?.focus(scroll_options);	new_active_editor.setCursor({line:0,ch:0});					// focus editor
					}																																					break;
				case type === 'content':								block = 'center';																				break;
			}
			scrollItemsIntoView(e,adjacent_leaf,type,block);
		}
		/*-----------------------------------------------*/
		// ARROW NAVIGATION between open leaves
		const cursorAtBOForEOF = (e,active_leaf,increment) => {									// is cursor at 0,0 or EOF, or is first or last tree item selected; returns bool
			let active_view_type = active_leaf.view.getViewType();
			let inline_title_visible,properties_visible,frontmatterLength,active_editor,active_cursor,cursorAtTop,cursorAtEnd,active_tree,active_tree_items,first_item,last_item;
			switch(true) {																																						// define variables
				case active_view_type === 'markdown':																															// md files
					inline_title_visible = this.app.vault.config.showInlineTitle === true;
					properties_visible = ( this.app.vault.config.propertiesInDocument === 'hidden' ? false : true );
					frontmatterLength = ( !properties_visible ? ( this.app.metadataCache.getCache(active_leaf.view?.file?.path)?.frontmatterPosition?.end?.line || -1 ) + 1 : 0 );
					active_editor = getActiveEditor(), active_cursor = getActiveCursor();
					cursorAtTop = ( active_cursor?.line - frontmatterLength === 0 ) && ( active_cursor?.ch === 0 );
					cursorAtEnd = ( active_editor?.getLine(active_editor?.lastLine())?.length === active_cursor?.ch && active_editor?.lastLine() === active_cursor?.line );		break;
				case active_view_type !== 'markdown' && !!active_leaf.view.tree:																								// non-md files
					active_tree = active_leaf.view.tree;
					active_tree_items = active_tree.containerEl.querySelectorAll('.tree-item');
					first_item = active_tree_items[0];
					last_item = active_tree_items[active_tree_items.length - 1];				
			}
			switch(true) {
				case active_view_type !== 'markdown' && !!active_tree:																											// check trees
					switch(true) {
						case increment === -1 && !!first_item.querySelector('.tree-item-self.has-focus'):																		// first item has focus
							switch(true) {
								case !first_item.classList.contains('first-item-focused'):		first_item.classList.add('first-item-focused');					return false;
								case first_item.classList.contains('first-item-focused'):		first_item.classList.remove('first-item-focused');				return true;
							}																																	break;
						case increment === 1 && !!last_item.querySelector('.tree-item-self.has-focus'):																			// last item has focus
							switch(true) {
								case !last_item.classList.contains('last-item-focused'):		last_item.classList.add('last-item-focused');					return false;
								case last_item.classList.contains('last-item-focused'):			last_item.classList.remove('last-item-focused');				return true;
							}																																	break;
						default: 		first_item.classList.remove('first-item-focused');		last_item.classList.remove('last-item-focused');				return false;
					}																																			break;
				case active_view_type !== 'markdown':																															// non-md files
				case active_view_type === 'markdown' && active_leaf.getViewState()?.state?.mode === 'preview':													return true;	// md in preview mode
				case ( /inline-title/.test(e.target.className) && 				 increment === -1 && inline_title_visible ):													// md files
				case ( /metadata-properties-heading/.test(e.target.className) && increment === -1 && !inline_title_visible && properties_visible ):				return true;
				case increment === -1 && cursorAtTop: e.preventDefault();																										// cursor at top
					switch(true) {
						case !active_editor.containerEl.classList.contains('cursor-at-top'): 	active_editor.containerEl.classList.add('cursor-at-top');		return false;
						case inline_title_visible:	active_leaf.view.inlineTitleEl.focus();		active_editor.containerEl.classList.remove('cursor-at-top');	return false;
						default:																active_editor.containerEl.classList.remove('cursor-at-top');	return true;
					}
				case increment === 1 && cursorAtEnd:																															// cursor at end
					switch(true) {
						case !active_editor.containerEl.classList.contains('cursor-at-end'): 	active_editor.containerEl.classList.add('cursor-at-end');		return false;
						case active_editor.containerEl.classList.contains('cursor-at-end'):		active_editor.containerEl.classList.remove('cursor-at-end');	return true;
					}	break;
				default:		active_editor.containerEl.classList.remove('cursor-at-top');	active_editor.containerEl.classList.remove('cursor-at-end');	return false;
			}
		}
		const navigateInPlace = (e,direction) => {																						// navigate in place
			let tree = workspace.getLeavesOfType('file-explorer')[0].view.tree;
			direction = ( direction !== undefined ? direction : e.key === 'ArrowUp' ? 'backwards' : 'forwards' );
			tree.setFocusedItem(tree.view.activeDom);
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
		}
		const compactModeNavigation = (e,active_leaf) => {
			let incr = ( /Down|Right/.test(e.key) ? 1 : -1 ), activeTabGroupChildren = workspace.activeTabGroup.children,index = activeTabGroupChildren.indexOf(active_leaf) + incr;
			let next_leaf = ( activeTabGroupChildren[index] ? activeTabGroupChildren[index] : incr === 1 ? activeTabGroupChildren[0] : activeTabGroupChildren[activeTabGroupChildren.length - 1]);
			delete active_leaf.containerEl.querySelector('iframe')?.scrolling;
			openInRightSplit(next_leaf);																								// open file in right split
			scrollItemsIntoView(e,next_leaf,'leaf','start');
		}
		const continuousNavigation = obsidian.debounce( (e) => {
			let active_leaf = workspace.activeLeaf, active_leaf_type = active_leaf.view.getViewType(), adjacent_leaf = null;
			let increment = ( /ArrowUp|PageUp/i.test(e.key) ? -1 : /ArrowDown|PageDown/i.test(e.key) ? 1 : 0 ), cursor_at_bof_or_eof = cursorAtBOForEOF(e,active_leaf,increment);
			switch(true) {
				case this.settings.navigateInPlace === true:																				   navigateInPlace(e);	break;	// navigate in place
				case active_leaf.parent.containerEl.classList.contains('is_compact_mode'):									compactModeNavigation(e,active_leaf);	break;	// use compact mode navigation
				case !/is_continuous_mode/.test(active_leaf.parent.containerEl.className): 																			break; 	// not in continuous mode
				case active_leaf_type === 'graph' && /Arrow/.test(e.key) && e.shiftKey:																				break;	// graph active
				case active_leaf_type === 'canvas' && ( e.target.contentEditable === 'true' || e.target.querySelector('.is-focused') ):								break;	// editing canvas
				case active_leaf_type !== 'markdown' && cursor_at_bof_or_eof:																								// other non-markdown types
				case active_leaf.getViewState().state.mode === 'preview':																									// preview mode
				case cursor_at_bof_or_eof:																																	// enter adjacent leaf
					adjacent_leaf = active_leaf.parent.children[active_leaf.parent.children.indexOf(active_leaf) + increment];												// get adjacent leaf
					if ( !adjacent_leaf ) { return } else { workspace.setActiveLeaf(adjacent_leaf,{focus:true}); }
					if ( adjacent_leaf.view.tree ) { focusItems(e,adjacent_leaf,increment,'content'); } else { focusItems(e,adjacent_leaf,increment,'leaf');}	break;	// set adjacent leaf active
				default:												focusItems(e,workspace.activeLeaf,increment,'content');			// ordinary arrow nav --> or just scroll content?
			}
		},25);
		/*-----------------------------------------------*/
		// OPEN ITEMS IN CONTINUOUS MODE getAllTabGroups
		const openItemsInContinuousMode = async (items,action,type,e) => {
			if ( !items ) { resetPinnedLeaves(); return }
			let mode = ( /^semi_compact/m.test(action) ? '@2' : /compact/.test(action) ? '@1' : '@0' )
			let recent_leaf = workspace.getMostRecentLeaf(), new_leaf, siblings, direction, bool; 
			items = prepItems(e,items,action,type,recent_leaf);																		// prep items (filter, sort, etc.)
			if ( items.length === 0 ) { resetPinnedLeaves(); return; }																// if no items, reset pins and end
			switch(true) {																											// warnings
				case (/replace/.test(action)) && this.settings.warnOnReplace === true 
					&& !window.confirm(`Continuous Mode:\nYou are about to replace all items currently open in the active split.
						\nAre you sure you want to do this?\n\n(This warning can be disabled in the settings.)`): 						resetPinnedLeaves(); return; // confirm replacing open items
				case items.length === 0:
					alert(type === 'document links' ? `Continuous Mode: No document links found.` : 
						`Continuous Mode:\n\nNo readable files found. 
						\n\nCheck the Settings to see if you have included any specific file types to be opened in Continuous Mode.`);	resetPinnedLeaves(); return; // alert no items found
			}
			switch(true) {																											// actions
				case ( /append/i.test(action) ):																			break;	// append items in active tab group; do nothing here
				case ( /replace/i.test(action) ):																					// close sibling leaves
					recent_leaf = workspace.getMostRecentLeaf().parent.children[0];
					workspace.setActiveLeaf(recent_leaf,{focus:true});
					siblings = recent_leaf.parent.children.filter(leaf => leaf !== recent_leaf);
					siblings?.forEach( sibling => sibling?.detach() );														break;
				default:																											// open items in new splits L/R/U/D
					switch(true) {
						case (/down/.test(action)):							direction = 'horizontal';	bool = false; 		break;
						case (/up/.test(action)):							direction = 'horizontal';	bool = true;		break;
						case (/left/.test(action)):							direction = 'vertical';		bool = true;		break;
						case (/right/.test(action)):						direction = 'vertical';		bool = false;		break;
					}
			}
			const openItems = async (items) => {																					// open items
				let maximumItemsToOpen = ( this.settings.maximumItemsToOpen < 1 || this.settings.maximumItemsToOpen === undefined ? Infinity : this.settings.maximumItemsToOpen );
				if ( items.length > this.settings.maximumItemsToOpen ) {															// show notice if items.length > maximumItemsToOpen
					const notice = (text) => { new Notice(text); return text; }
					notice('Opening '+ maximumItemsToOpen +' of '+ items.length +' items.')
				}
				for ( let i = 0; i < maximumItemsToOpen && i < items.length; i++ ) {												// limit number of items to open
					switch(true) {
						case i === 0 && /replace/.test(action):																		// replace items
							recent_leaf.openFile(items[0]); 
							recent_leaf.setPinned(true);																	break;
						case /down|up|left|right/.test(action):																		// open items in new split
							if ( i === 0 ) { 
								new_leaf = workspace.createLeafBySplit(recent_leaf,direction,bool);									// create new split
							} else {
								new_leaf = workspace.createLeafInParent(workspace.activeLeaf.parent,i);								// create new leaves in split
							}
							new_leaf.openFile(items[i]);																			// open file
							new_leaf.setPinned(true);																				// prevent opening next file in current tab
							workspace.setActiveLeaf(new_leaf,{focus:true});													break;	// open file in new leaf and focus
						default:																									// append items
							new_leaf = workspace.getLeaf(false);																	// open new tab/leaf
							new_leaf.openFile(items[i]);																			// open file
							new_leaf.setPinned(true);																				// prevent opening next file in current tab
						}
				}
				toggleContinuousMode([this.app.appId +'_'+ workspace.getMostRecentLeaf().parent.id],true,mode);						// ensure continuous mode			
				this.settings.tabGroupIds.push(this.app.appId +'_'+ workspace.getMostRecentLeaf().parent.id +'_'+ mode);			// update settings
				this.settings.tabGroupIds = [...new Set(this.settings.tabGroupIds)]
				this.saveSettings();
			}
			openItems(items);
			resetPinnedLeaves();
			setTimeout( () => {
				workspace.setActiveLeaf(workspace.activeTabGroup.children[0],{focus:true}); 
				workspace.activeTabGroup.children[0].tabHeaderInnerTitleEl.click();
				workspace.revealLeaf(workspace.activeTabGroup.children[0]); 
				workspace.activeTabGroup.children[0].containerEl.scrollIntoView({ behavior:scrollBehavior() });
			},0)
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
 			workspace.activeLeaf.openFile(leaf.view.file,{active:false});																// open file
 			workspace.setActiveLeaf(leaf,{focus:true});
		}
		/*-----------------------------------------------*/
		// REGISTER DOM EVENTS
		this.registerDomEvent(document,'click', (e) => {
			let active_compact_leaf;
			switch(true) {
				case e.target.closest('.workspace-tab-header-status-icon.mod-pinned') !== null:
				case e.target.closest('.sidebar-toggle-button') !== null:										e.stopPropagation();					break;
				case typeof e.target.className === 'string' && e.target?.className?.includes('metadata-'):												break;
				case e.target.classList.contains('continuous_mode_open_links_button'):																			// nobreak
				case e.target.closest('.continuous_mode_open_links_button') !== null:							showLinksMenu(e);						break;	// open links in continuous mode
				case e.target.closest('.workspace-tabs.is_compact_mode') !== null 																		// compact mode: open in right split on tab click
					&& e.target.closest('.workspace-tab-header-new-tab') === null && e.target.closest('.workspace-tab-header-tab-list') === null:
						active_compact_leaf = workspace.getActiveViewOfType(obsidian.View)?.leaf;
						if ( active_compact_leaf.parent.containerEl.classList.contains('is_compact_mode') ) { openInRightSplit(active_compact_leaf); }
						workspace.setActiveLeaf(active_compact_leaf,{focus:true});
						scrollActiveLeaf(e,workspace.activeLeaf,'start');
						scrollTabHeader(e,workspace.activeLeaf);																					break;	// click tab, scroll into view
				case ( /workspace-tab-header|nav-header|view-header-title-container|menu-item-title/.test(e.target.className) 
						&& workspace.activeTabGroup.containerEl.classList.contains('is_continuous_mode') 
						&& !/view-header-title|inline-title/.test(e.target.className)):
						scrollActiveLeaf(e,workspace.activeLeaf,'start')
						scrollTabHeader(e,workspace.activeLeaf);																					break;	// click tab, scroll into view
			}
		});
		this.registerDomEvent(document,'mousedown', (e) => {
			let action = this.settings.allowSingleClickOpenFolderAction;
			const testStr = /append .+ in active tab group|replace active tab group|open .+ in new split|compact mode:/i;
			switch(true) {
				case ( e.target.classList.contains('menu-item-title') && testStr.test(e.target.innerText) ): 	setPinnedLeaves();						break; // CM menu items
				case ( /nav-folder-title/.test(e.target.className) && this.settings.allowSingleClickOpenFolder === true && !e.altKey && !e.ctrlKey && !e.shiftKey && e.button !== 2 ):
					setPinnedLeaves(action,'folder');
					e.target.closest('.nav-folder-title').addEventListener('click',function(e) { e.preventDefault(); });								break;	// prevent default toggle folder collapse
				case ( /nav-file-title/.test(e.target.className) && this.settings.allowSingleClickOpenFolder === true && !e.altKey && !e.ctrlKey && !e.shiftKey && e.button !== 2 ):
					setPinnedLeaves(action,'file');
					e.target.closest('.nav-file-title').addEventListener('click',function(e) { e.preventDefault(); },{once:true});						break;	// prevent default open file behavior
				case e.target.closest('.workspace-tabs.is_compact_mode') !== null 
					&& e.target.closest('.workspace-tab-header-new-tab') === null && e.target.closest('.workspace-tab-header-tab-list') === null:		break;
				case (e.buttons === 2 || e.ctrlKey) && e.target.closest('.longform-explorer') !== null:		getLongformItems(e);						break;	// show longform menu
			}
		});
		this.registerDomEvent(document,'mouseup', (e) => {
			let action = this.settings.allowSingleClickOpenFolderAction;
			switch(true) {
				case ( /nav-folder-title/.test(e.target.className) && this.settings.allowSingleClickOpenFolder === true )  								// open file explorer folders on single click
					&& e.target.closest('.nav-folder-collapse-indicator') === null && e.target.closest('.collapse-icon') === null
					&& !e.altKey && !e.ctrlKey && !e.shiftKey && e.button !== 2:
					switch(true) {
						case action === 'disabled':									return alert("Continuous Mode:\nPlease select a single click action in the settings.");
						default: 													openItemsInContinuousMode(getFileExplorerItems(e),action,'folder',e);
					}																																	break;
				case ( /nav-file-title/.test(e.target.className) && this.settings.allowSingleClickOpenFolder === true ) && !e.altKey && !e.ctrlKey && !e.shiftKey && e.button !== 2:
																					openItemsInContinuousMode(getFileExplorerItems(e),action,'file');	break;
				case !action:
				case action === 'disabled':
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
			if ( /pageup|pagedown|arrow/i.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !/form|input|textarea|select/i.test(e.target.tagName ) ) { continuousNavigation(e); }
		});
		this.registerDomEvent(window,'keyup', (e) => { if ( e.target.cmView ) { scrollActiveLeafContent(e,workspace.activeLeaf); } });							// typewriter scroll
		this.registerDomEvent(window,'dragstart', (e) => {
			if ( e.target.nodeType !== 1 || !e.target?.closest('.workspace-tabs')?.classList?.contains('is_continuous_mode') ) { return; }
			if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }					// get initial tab header index for onTabHeaderDragEnd()
		});
		this.registerDomEvent(window,'dragend', (e) => {
			if ( /nav-file-title/.test(e.srcElement.className) ) { resetPinnedLeaves(); }
		});
		/*-----------------------------------------------*/
		// REGISTER EVENTS
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu,file,source,leaf) => {																				// on file-menu
				let items, links, files;
				let type = ( file instanceof obsidian.TFolder ? 'folder contents' : file instanceof obsidian.TFile ? 'file' : undefined );
				switch(true) {
					case (/link-context-menu/.test(source)):																							// click link
						menu.addItem((item) => { 
							openItemsInContinuousModeMenuItems(item,file,'link',menu,source);															// add open link items
						});																														break;
					case (/file-explorer-context-menu/.test(source)):																					// link context menu/file-explorer menu
						menu.addItem((item) => {
							openItemsInContinuousModeMenuItems(item,file,type,menu,source);														// add open files items
						});																														break;
					case (/file-explorer/.test(source)):																								// file-tree-alternative plugin support
						if ( this.app.workspace.getActiveViewOfType(obsidian.View).leaf === this.app.workspace.getLeavesOfType('file-tree-view')[0] ) {
							menu.addItem((item) => {
								openItemsInContinuousModeMenuItems(item,file,type,menu,source);
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
					openItemsInContinuousModeMenuItems(item,getFilesFromSearchResults(),'search results',menu);
				})
			})
		);
		let init_CM = true;
		workspace.onLayoutReady( () => {
			toggleContinuousMode(this.settings.tabGroupIds,init_CM);		init_CM = false;		// restore continuous mode onload; update after initial load
		});
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				toggleContinuousMode(this.settings.tabGroupIds,init_CM); 
				scrollItemsIntoView(null,workspace.activeLeaf,'leaf','start');
			})
		);
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				scrollTabHeader(workspace.activeLeaf);
			})
		);
		/*-----------------------------------------------*/
		// ADD CONTEXTUAL MENU ITEMS
		const addContinuousModeMenuItem = (item, tab_group_id, leaf) => {																// add continuous mode menu items (toggle, headers, sort)
			let tab_group = getTabGroupById(tab_group_id?.split('_')[1]), tab_group_el = tab_group?.containerEl, tab_group_classList = tab_group_el?.classList;
			if ( this.app.isMobile === true ) { 
				addMobileMenuItems(item,tab_group,tab_group_el,tab_group_id,tab_group_classList); 
			} else {
				addDesktopMenuItems(item,tab_group,tab_group_el,tab_group_id,tab_group_classList,leaf);
			}
		}
		const addDesktopMenuItems = (item,tab_group,tab_group_el,tab_group_id,tab_group_classList,leaf) => {
			if ( !tab_group_id ) { tab_group_id = false }
			item.setTitle('Continuous Mode')
				.setIcon('scroll-text')
				.setSection( leaf ? 'pane' : 'action' )
				.setSubmenu().addItem((item2) => {
					item2.setTitle('Toggle Continuous Mode')
					.setIcon('scroll-text')
					.setChecked( tab_group_classList?.contains('is_continuous_mode') ? true : false )
					.onClick(async () => { 
						toggleContinuousMode(tab_group_id || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@0');
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
							toggleContinuousMode(tab_group_id || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@2');
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
							toggleContinuousMode(tab_group_id || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@1');
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
					addChangeSortOrderMenuItems(item4,tab_group,tab_group_el,tab_group_id,tab_group_classList) 
				})
			.addSeparator();
		}
		// add mobile menu items
		const addMobileMenuItems = (item,tab_group,tab_group_el,tab_group_id,tab_group_classList) => {
			if ( !tab_group_id ) { tab_group_id = false }
			item.menu
				.addItem((item2) => {
					item2.setTitle('Toggle Continuous Mode')
					.setIcon('scroll-text')
					.setChecked( tab_group_classList?.contains('is_continuous_mode') ? true : false )
					.onClick(async () => { 
						toggleContinuousMode(tab_group_id || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@0');
					})
				})
				.addItem((item12) => {
					if ( tab_group === workspace.rootSplit.children[0] ) {
						item12.setTitle('Toggle Semi-Compact Mode')
						.setIcon('semiCompactMode')
						.setChecked( tab_group_classList?.contains('is_semi_compact_mode') ? true : false )
						.onClick(async () => {
							toggleContinuousMode(tab_group_id || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@2');
						})
					}
				})
				.addItem( (item12) => {
					if ( tab_group === workspace.rootSplit.children[0] ) {
						item12.setTitle('Toggle Compact Mode')
						.setIcon('compactMode')
						.setChecked( tab_group_classList?.contains('is_compact_mode') ? true : false )
						.onClick(async () => {
							toggleContinuousMode(tab_group_id || [this.app.appId +'_'+ workspace.activeTabGroup.id],false,'@1');
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
				.addItem((item11) => {
				item11.setTitle('Use File Explorer order')
					.setIcon('list')
					.setChecked( tab_group_el?.dataset?.sort_order === 'fileExplorer' ? true : false )
					.onClick(async () => { 
						changeSortOrder(tab_group_id,'fileExplorer');
					})
				})
				.addItem((item5) => {
					item5.setTitle('Sort by file name (A to Z)')
					.setIcon('arrowDownAZ')
					.setChecked( tab_group_el?.dataset?.sort_order === 'alphabetical' ? true : false )
					.onClick(async () => { 
						changeSortOrder(tab_group_id,'alphabetical');
					})
				})
				.addItem((item6) => {
					item6.setTitle('Sort by file name (Z to A)')
					.setIcon('arrowDownZA')
					.setChecked( tab_group_el?.dataset?.sort_order === 'alphabeticalReverse' ? true : false )
					.onClick(async () => { 
						changeSortOrder(tab_group_id,'alphabeticalReverse');
					})
				})
				.addItem((item7) => {
					item7.setTitle('Sort by modified time (new to old)')
					.setIcon('arrowDown10')
					.setChecked( tab_group_el?.dataset?.sort_order === 'byModifiedTime' ? true : false )
					.onClick(async () => { 
						changeSortOrder(tab_group_id,'byModifiedTime');
					})
				})
				.addItem((item8) => {
					item8.setTitle('Sort by modified time (old to new)')
					.setIcon('arrowDown01')
					.setChecked( tab_group_el?.dataset?.sort_order === 'byModifiedTimeReverse' ? true : false )
					.onClick(async () => { 
						changeSortOrder(tab_group_id,'byModifiedTimeReverse');
					})
				})
				.addItem((item9) => {
					item9.setTitle('Sort by created time (new to old)')
					.setIcon('arrowDown10')
					.setChecked( tab_group_el?.dataset?.sort_order === 'byCreatedTime' ? true : false )
					.onClick(async () => { 
						changeSortOrder(tab_group_id,'byCreatedTime');
					})
				})
				.addItem((item10) => {
					item10.setTitle('Sort by created time (old to new)')
					.setIcon('arrowDown01')
					.setChecked( tab_group_el?.dataset?.sort_order === 'byCreatedTimeReverse' ? true : false )
					.onClick(async () => { 
						changeSortOrder(tab_group_id,'byCreatedTimeReverse');
					})
				})
		}
		// add change sort order menu items
		const addChangeSortOrderMenuItems = (item,tab_group,tab_group_el,tab_group_id,tab_group_classList) => {
			item.setTitle('Change sort order')
				.setIcon('arrow-up-narrow-wide')
				.setDisabled( tab_group?.children?.length > 1 && tab_group_classList?.contains('is_continuous_mode') ? false : true )
				.setSubmenu()
					.addItem((item11) => {
					item11.setTitle('File Explorer order')
						.setIcon('list')
						.setChecked( tab_group_el?.dataset?.sort_order === 'fileExplorer' ? true : false )
						.onClick(async () => { 
							changeSortOrder(tab_group_id,'fileExplorer');
						})
					})
					.addItem((item5) => {
					item5.setTitle('File name (A to Z)')
						.setIcon('arrowDownAZ')
						.setChecked( tab_group_el?.dataset?.sort_order === 'alphabetical' ? true : false )
						.onClick(async () => { 
							changeSortOrder(tab_group_id,'alphabetical');
						})
					})
					.addItem((item6) => {
						item6.setTitle('File name (Z to A)')
						.setIcon('arrowDownZA')
						.setChecked( tab_group_el?.dataset?.sort_order === 'alphabeticalReverse' ? true : false )
						.onClick(async () => { 
							changeSortOrder(tab_group_id,'alphabeticalReverse');
						})
					})
					.addSeparator()
					.addItem((item7) => {
						item7.setTitle('Modified time (new to old)')
						.setIcon('arrowDown10')
						.setChecked( tab_group_el?.dataset?.sort_order === 'byModifiedTime' ? true : false )
						.onClick(async () => { 
							changeSortOrder(tab_group_id,'byModifiedTime');
						})
					})
					.addItem((item8) => {
						item8.setTitle('Modified time (old to new)')
						.setIcon('arrowDown01')
						.setChecked( tab_group_el?.dataset?.sort_order === 'byModifiedTimeReverse' ? true : false )
						.onClick(async () => { 
							changeSortOrder(tab_group_id,'byModifiedTimeReverse');
						})
					})
					.addSeparator()
					.addItem((item9) => {
						item9.setTitle('Created time (new to old)')
						.setIcon('arrowDown10')
						.setChecked( tab_group_el?.dataset?.sort_order === 'byCreatedTime' ? true : false )
						.onClick(async () => { 
							changeSortOrder(tab_group_id,'byCreatedTime');
						})
					})
					.addItem((item10) => {
						item10.setTitle('Created time (old to new)')
						.setIcon('arrowDown01')
						.setChecked( tab_group_el?.dataset?.sort_order === 'byCreatedTimeReverse' ? true : false )
						.onClick(async () => { 
							changeSortOrder(tab_group_id,'byCreatedTimeReverse');
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
				open_links_menu.addItem( item => openItemsInContinuousModeMenuItems(item,files,'query block links',undefined,'links-menu' ) );
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
		const addDesktopOpenInContinuousModeItems = (item,file,type) => {
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
		// ADD COMMAND PALETTE ITEMS		
		['active','left','right','root'].forEach( side => {											// add commands: toggle continuous mode in active tab group, left/right sidebars
			const toggleCM = (tab_group) => { 
				toggleContinuousMode([this.app.appId +'_'+ tab_group.id],false,'@0') 
			}
			this.addCommand({																			// add command: toggle continuous mode in active tab group
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
				name:	( side === 'active' ? 'Toggle visibility of note titles in active tab group' 
					: side === 'root' ? 'Toggle visibility of note titles in root tab groups' 
					: 'Toggle visibility of note titles '+side+' sidebar' ),
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
							case type === 'search results': items = getFilesFromSearchResults();																break;
						}
						setPinnedLeaves();
						openItemsInContinuousMode(items,action,type);
					}
				});
			});
		});		
		Object.entries( {'fileExplorer':'file explorer order','alphabetical':'file name (A to Z)','alphabeticalReverse':'file name (Z to A)','byModifiedTime':'modified time (new to old)','byModifiedTimeReverse':'modified time (old to new)','byCreatedTime':'created time (new to old)','byCreatedTimeReverse':'created time (old to new)'} ).forEach( ([key,value]) => {
			this.addCommand({
				id: 'sort-files-'+key,
				name: 'Sort active tab group by '+value,
				callback: () => {
					if ( workspace.activeTabGroup.containerEl.classList.contains('is_continuous_mode') ) {
						changeSortOrder(this.app.appId +'_'+ workspace.activeTabGroup.id,key);
					} else {
						alert('Continuous Mode:\nActive tab group is not in continuous mode.');
					}
				}
			});
		});
		this.addCommand({																				// add command: toggle hide tab bar
			id: 	( 'toggle-hide-tab-bar'),
			name:	( 'Toggle hide tab bar in active tab group' ),
			callback: async () => { 
				this.settings.hideTabBar = !this.settings.hideTabBar; await this.saveSettings();
				let active_split = workspace.getMostRecentLeaf().parent; active_split.containerEl.classList.toggle('hide_tab_bar');
				}
		});
		this.addCommand({																				// add command: toggle navigate in place
			id: 	( 'toggle-navigate-in-place'),
			name:	( 'Toggle navigate in place' ),
			callback: async () => { this.settings.navigateInPlace = !this.settings.navigateInPlace; await this.saveSettings(); }
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
    };
    // end onload
	/*-----------------------------------------------*/
    // on plugin unload
	onunload() {
		let tab_groups = this.app.workspace.containerEl.querySelectorAll('.workspace-tabs');
		tab_groups.forEach( 
			el => {
				el?.classList?.remove('is_continuous_mode','hide_tab_bar','hide_note_titles','is_compact_mode','is_semi_compact_mode','only_show_file_name','is_enable_scroll','is_smooth_scroll','is_typewriter_scroll');
				delete el?.dataset?.sort_order; 
				el?.querySelectorAll('.continuous_mode_open_links_button').forEach(btn => btn?.remove() );
				el.querySelectorAll('.workspace-leaf[data-level]')?.forEach(leaf => delete leaf?.dataset?.level);
			}
		)
    }
	// load settings
    async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		for (let key in this.settings) { 
			if (!(key in DEFAULT_SETTINGS)) { 
				delete this.settings[key]; 
			}		// sanitize settings 
		}
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

		new obsidian.Setting(containerEl).setName("1. File Handling").setHeading().setDesc('The settings in this section allow you to choose which items are opened in Continuous Mode when clicking File Explorer items, or using the commands and contextual menus. (Note: toggling off these settings does not prevent any of the deselected file types from being opened manually.)');
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

		new obsidian.Setting(containerEl).setName("2. Opening Multiple Items in Continuous Mode").setHeading().setDesc('The settings in this section provide options for opening multiple items in Continuous Mode (e.g., File Explorer folders).');
        new obsidian.Setting(containerEl).setName('Allow single click to open File Explorer items in Continuous Mode').setDesc('Enable this setting to make it possible to open the items in the File Explorer with a single click. Set the default single click action below.').setClass("cm-setting-indent")
        	.addToggle( (A) => A.setValue(this.plugin.settings.allowSingleClickOpenFolder)
        	.onChange(async (value) => {
        		this.plugin.settings.allowSingleClickOpenFolder = value;
        		await this.plugin.saveSettings();
        }));
		new obsidian.Setting(containerEl).setName('Set default single-click action:').setClass("cm-setting-indent-2").setClass('hidden')
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
		new obsidian.Setting(containerEl).setName('Warn on replace').setClass('next-hidden').setDesc('Warn when replacing active tab group items with new items.').setClass("cm-setting-indent-2")
			.addToggle( A => A.setValue(this.plugin.settings.warnOnReplace)
			.onChange(async (value) => {
				this.plugin.settings.warnOnReplace = value;
				await this.plugin.saveSettings();
		}));
		
        new obsidian.Setting(containerEl).setName('Open folders recursively').setDesc('Recursively open all items in a folder, including those in subfolders. Sorting is based on the default sort order setting (below). Note: If the default sort is “File Explorer order”, items in collapsed folders will be ignored (i.e., only visible items will be opened.); however, clicking a collapsed folder will open all the contained items in alphabetical order.').setClass("cm-setting-indent")
        	.addToggle( (A) => A.setValue(this.plugin.settings.openFoldersRecursively)
        	.onChange(async (value) => {
        		this.plugin.settings.openFoldersRecursively = value;
        		await this.plugin.saveSettings();
        }));
		new obsidian.Setting(containerEl).setName('Maximum number of items to open at one time').setDesc('Leave empty (or set to 0) to open all items at once. Hint: Setting a value here allows you to append the items in a folder incrementally by repeatedly clicking it (with the default single click action set to “Append”) or selecting one of the “append” menu/command options. This is useful for dealing with folders containing a large number of items.').setClass("cm-setting-indent")
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
		new obsidian.Setting(containerEl).setName('Default sort order:').setDesc(`If no value is set, items will be sorted according to the current sort order of the source (e.g., the file explorer, search results, etc.). Note: “File Explorer order” sorts files in their exact File Explorer order, honoring any custom sorting handled by other plugins. Note: This only works with uncollapsed folders; clicking a collapsed folder will default to alphabetical order.`).setClass("cm-setting-indent")
			.addDropdown((dropDown) => {
				dropDown.addOption("disabled", "—");
				dropDown.addOption('fileExplorer','File Explorer order');
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
		new obsidian.Setting(containerEl).setName('Index files at top').setDesc('If the directory contains an “index.md” file or a file with the same name as the directory itself, it will be moved to the top of the opened files, regardless of the sort order.').setClass("cm-setting-indent").setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.indexFilesAtTop)
			.onChange(async (value) => {
				this.plugin.settings.indexFilesAtTop = value;
				await this.plugin.saveSettings();
		}));

// 		new obsidian.Setting(containerEl).setName("About Compact Mode and Semi-Compact Mode").setHeading();
//         this.containerEl.createEl("div", {text: 'Compact and Semi-Compact Mode show previews of your notes in the left split, similar to the second side-pane previews in apps like Evernote, Bear Notes, Simplenote, Apple Notes, etc. Notes can be navigated up and down with the arrow keys as in Continuous Mode, but in Compact Mode, the selected note will be opened in the right split; in Semi-Compact Mode, the selected note will be expanded in place for editing, leaving the other notes in compact view.', cls: 'setting-item-description' });
//         this.containerEl.createEl("div", {text: '(Note: You may wish to disable the Obsidian editor setting “Always focus new tabs” to allow continuous arrow navigation of Compact Mode items.)', cls: 'setting-item-description' });

		new obsidian.Setting(containerEl).setName("3. Appearance").setHeading().setDesc('Hide various elements of the workspace UI to enhance the “continuous” experience.');
		new obsidian.Setting(containerEl).setName('Hide tab bar').setDesc('Hide the row of tabs at the top of the split. Provides a bit more vertical space and reduces visual clutter, especially with many tabs open.').setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.hideTabBar)
			.onChange(async (value) => {
				let tab_groups = this.app.workspace.rootSplit.containerEl.querySelectorAll('.workspace-tabs.is_continuous_mode');
				if ( value === true ) {
					tab_groups?.forEach( tab_group => tab_group.classList?.add('hide_tab_bar') )
				} else {
					tab_groups?.forEach( tab_group => tab_group.classList?.remove('hide_tab_bar') )
				}
				this.plugin.settings.hideTabBar = value;
				await this.plugin.saveSettings();
		}));
		new obsidian.Setting(containerEl).setName('Hide note headers').setDesc('Hide the note headers when opening items in Continuous Mode.').setClass("cm-setting-indent")
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
		new obsidian.Setting(containerEl).setName('Only show file name in note headers').setDesc('Hide the file path.').setClass("cm-setting-indent")
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

		new obsidian.Setting(containerEl).setName("4. Other Settings").setHeading();
		new obsidian.Setting(containerEl).setName('Enable navigate in place:').setDesc('From the first or last line of the active editor, use the arrow up/down keys to open the previous or next file (as listed in the File Explorer) in the same tab instead of moving into the previous or next tab.').setClass("cm-setting-indent")
			.addToggle( A => A.setValue(this.plugin.settings.navigateInPlace)
			.onChange(async (value) => {
				this.plugin.settings.navigateInPlace = value;
				await this.plugin.saveSettings();
		}));

		new obsidian.Setting(containerEl).setName('Enable scroll-into-view').setDesc('Enable auto-scrolling of leaves, tab headers, etc. into view when clicked, when typing in the active editor, or when using the arrow keys.').setClass("cm-setting-indent")
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
		new obsidian.Setting(containerEl).setName('Use smooth scrolling').setClass("cm-setting-indent-2").setClass('hidden').setDesc('Only available when scroll-into-view is enabled.')
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
		new obsidian.Setting(containerEl).setName('Enable typewriter scrolling').setClass("cm-setting-indent-2").setClass('next-hidden').setDesc('Keeps the active paragraph in the center of the screen. Only available when scroll-into-view is enabled.')
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
