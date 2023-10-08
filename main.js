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
/* global Reflect, Promise */

let extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

let ContViewPlugin = /** @class */ (function (_super) {
    __extends(ContViewPlugin, _super);
    function ContViewPlugin() { return _super !== null && _super.apply(this, arguments) || this; }
    
    ContViewPlugin.prototype.onload = function () {
		let this_workspace = 				this.app.workspace;
		function getTabGroups()				{ return Array.from(this_workspace.querySelectorAll('.workspace-tabs')); }		// 
		function getActiveTabGroup()		{ return this_workspace.activeTabGroup; }
		function getTabGroupHeaders(group)	{ return this_workspace.activeTabGroup.tabHeaderEls; }
		function getTabHeaderIndex(e)		{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
		function this_activeleaf() 			{ return this_workspace.activeLeaf; }
		function this_editor()				{ return this_activeleaf().view.sourceMode.cmEditor; }
		/*-----------------------------------------------*/
		// DRAG TAB HEADERS TO REARRANGE LEAVES
		function onTabHeaderDragEnd(e,initialTabHeaderIndex) {
			e.target.ondragend = function(f) { 
				if ( getTabHeaderIndex(f) !== initialTabHeaderIndex ) { rearrangeLeaves(f,initialTabHeaderIndex); }		// only rearrange leaves if tab header is actually moved to a new position
			}
		}
		// Rearrange leaves on dragend
		function rearrangeLeaves(e,initialTabHeaderIndex) {
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
        /* ----------------------- */
        // Mouse events
		this.registerDomEvent(document,"dragstart",function(e) { 
			if ( e.target.classList.contains('workspace-tab-header') ) { onTabHeaderDragEnd(e,getTabHeaderIndex(e)); }	// get initial tab header index for onTabHeaderDragEnd()
		});
        /* ----------------------- */
        // Keydown events
        this.registerDomEvent(document, "click", function (e) {
            if ( e.target.classList.contains('workspace-tab-container') ) { e.target.closest('.workspace-tabs').querySelector('.workspace-tab-header.is-active')?.click(); }
        });
        this.registerDomEvent(document, "keydown", function (e) { leafArrowNavigation(e); });

        function leafArrowNavigation(e) {
        	if ( e.target.closest('.workspace-split.mod-root') === null ) { return; } 									// return if not in leaf editor
			let key = e.key;
			let cursorHead = this_editor().getCursor("head");
			let cursorAnchor = this_editor().getCursor("anchor");
			let activeTabGroupChildren = this_activeleaf().workspace.activeTabGroup.children;
			let doc = this_editor().getDoc();
        	switch(true) {
				case ( /Arrow/.test(key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ):		        		// Arrow navigation between leaves
					switch(key) {
						case 'ArrowUp': case 'ArrowLeft':
							switch(true) {
								case e.target.classList.contains('inline-title') && window.getSelection().anchorOffset === 0:										// cursor in inline-title
								case cursorAnchor.line === 0 && cursorAnchor.ch === 0:																				// cursor at first line, first char
									if ( this_activeleaf().containerEl.previousSibling !== null ) {																	// ignore if first leaf
										this_workspace.setActiveLeaf(activeTabGroupChildren[activeTabGroupChildren.indexOf(this_activeleaf()) - 1],{focus:true});	// make previous leaf active 
										this_editor().setCursor({line:this_editor().lastLine(),ch:this_editor().lastLine().length - 1});							// select last char
									}
									break;
							}
							break;
						case 'ArrowDown':	case 'ArrowRight': 
							switch(true) {
								case ( cursorAnchor.ch === this_editor().getLine(this_editor().lastLine()).length && cursorAnchor.line === this_editor().lineCount() - 1 ):
									this_workspace.setActiveLeaf(activeTabGroupChildren[activeTabGroupChildren.indexOf(this_activeleaf()) + 1],{focus:true}); 		// make next leaf active 
									break;
							}
							break;
					}
				break;
				// Start another keydown case here
            }
        }
    };
    ContViewPlugin.prototype.onunload = function () { console.log('Unloading the macOS Keyboard Navigation plugin.'); };
    return ContViewPlugin;
}(obsidian.Plugin));

module.exports = ContViewPlugin;
