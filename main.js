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
        let _this = this;
		let this_workspace = _this.app.workspace;
		function getTabGroups()				{ return Array.from(this_workspace.querySelectorAll('.workspace-tabs')); }		// 
		function getActiveTabGroup()		{ return this_workspace.activeTabGroup; }
		function getTabGroupHeaders(group)	{ return this_workspace.activeTabGroup.tabHeaderEls; }
		function getTabHeaderIndex(e)		{ return Array.from(e.target.parentElement.children).indexOf(e.target); }
		/*-----------------------------------------------*/
		// DRAG TAB HEADERS TO REARRANGE LEAVES
		function tabDragEnd(e,initialTabHeaderIndex) {
			e.target.ondragend = function(f) { 
				if ( getTabHeaderIndex(f) !== initialTabHeaderIndex ) {
					
					tabDrag(f,initialTabHeaderIndex);
				} 
			}
		}
		this.registerDomEvent(document,"dragstart",function(e) { 
			if ( e.target.classList.contains('workspace-tab-header') ) { tabDragEnd(e,getTabHeaderIndex(e)); }		// start tab header drag: get initial tab header index for tabDragEnd()
		});
		this.registerDomEvent(document,"dragend",function(e) { /*tabDragEnd(tab,initialTabHeaderIndex);*/ });

		// Rearrange elements in array
		function moveInArray(arr,from,to) { let item = arr.splice(from, 1);	arr.splice(to, 0, item[0]); }			// Delete the item from its current position, and move it to new position
		// Rearrange tabs on dragend
		function tabDrag(e,initialTabHeaderIndex) {
			let tab_headers = Array.from(e.target.closest('.workspace-tab-header-container-inner').querySelectorAll('.workspace-tab-header'));
			let droppedTabIndex = getTabHeaderIndex(e);
			let leaves = Array.from(e.target.closest('.workspace-tabs').querySelectorAll('.workspace-tab-container .workspace-leaf'));
			moveInArray(leaves, initialTabHeaderIndex, droppedTabIndex);											// rearrange the leaves
			e.target.closest('.workspace-tabs').querySelector('.workspace-tab-container').innerHTML = '';	
			//tab.closest('.workspace-tabs').querySelector('.workspace-tab-container').insertAdjacentHTML('beforeend',leaf.outerHTML);															// empty the leaves container
//			leaves.forEach( leaf => e.target.closest('.workspace-tabs').querySelector('.workspace-tab-container').insertAdjacentHTML('beforeend',leaf.outerHTML) );	// restore the rearranged leaves
//			this_workspace.setActiveLeaf()
//			tab_headers[droppedTabIndex].click();																	// select the dropped leaf by clicking tab
		}
        /* ----------------------- */
        // Mouse events
        this.registerDomEvent(document, "mousedown", function(e) { let target = e.target;
			if ( /workspace-tab-header/.test(target.className) ) { 
				let tab_header = target.closest('.workspace-tab-header');
				let tab_headers = Array.from(target.closest('.workspace-tab-header-container-inner').querySelectorAll('.workspace-tab-header'));
				let initialTabHeaderIndex = tab_headers.indexOf(tab_header);		// get index of the clicked tab...
				//tab_header.ondragstart = function() { tabDragEnd(tab_header,initialTabHeaderIndex) };									// on dragstart...call tabdragend with index of dragged tab
			}
        });
        this.registerDomEvent(document, "click", function(e) {
        	console.log("CLICK"); // console.log(e.target);
        });
        /* ----------------------- */
        // Keydown events
        this.registerDomEvent(document, "keydown", function (e) {
			let key = e.key;
			let this_activeleaf = function() { return this_workspace.activeLeaf; }
			let this_editor = function() { return this_activeleaf().view.sourceMode.cmEditor; }
			let cursorHead = this_editor().getCursor("head");
			let cursorAnchor = this_editor().getCursor("anchor");
			let activeTabGroupChildren = this_activeleaf().workspace.activeTabGroup.children;
			let doc = this_editor().getDoc();
//console.log(this_editor.getLine(this_editor.lastLine()));
console.log(activeTabGroupChildren);
        	switch(true) {
	        	// Arrow navigation between leaves
				case ( /Arrow/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ):
					switch(true) {
						case key === "ArrowUp": case key === "ArrowLeft":
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
						case key === "ArrowDown":	case key === "ArrowRight": 
							switch(true) {
								case ( cursorAnchor.ch === this_editor().getLine(this_editor().lastLine()).length && cursorAnchor.line === this_editor().lineCount() - 1 ):
									this_workspace.setActiveLeaf(activeTabGroupChildren[activeTabGroupChildren.indexOf(this_activeleaf()) + 1],{focus:true}); // make next leaf active 
									break;
							}
							break;
					}
				break;
				// Start another keydown case here
            }
	// 				if ( this_editor.getSelection() ) { this_editor.scrollIntoView({range:this_editor.getSelection().start,this_editor.getSelection().end},behaviour:"smooth"); }
	// 					from:{line:,ch:},
	// 					to:{line:,ch:}
	// 				});
	//                     if (e.getModifierState("Shift")) { // select up
	//                         if (cursorHead.ch != 0) {
	//                             doc.setSelection({ line: cursorAnchor.line, ch: cursorAnchor.ch }, { line: cursorHead.line, ch: 0 }, { scroll: true });
	//                         } else {
	//                             doc.setSelection({ line: cursorAnchor.line, ch: cursorAnchor.ch }, { line: cursorHead.line - 1, ch: 0 }, { scroll: true });
	//                         }
	//                     } else { // move up
	//                         if (cursorHead.ch != 0) { editor.setCursor(cursorHead.line, 0); } else { editor.setCursor((cursorHead.line - 1), 0); }
	//                     }
        });
    };
    ContViewPlugin.prototype.onunload = function () { console.log('Unloading the macOS Keyboard Navigation plugin.'); };
    return ContViewPlugin;
}(obsidian.Plugin));

module.exports = ContViewPlugin;
