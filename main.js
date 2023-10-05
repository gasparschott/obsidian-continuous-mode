'use strict';

var obsidian = require('obsidian');

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

var extendStatics = function(d, b) {
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

var ContViewPlugin = /** @class */ (function (_super) {
    __extends(ContViewPlugin, _super);
    function ContViewPlugin() { return _super !== null && _super.apply(this, arguments) || this; }
    ContViewPlugin.prototype.onload = function () {
        var _this = this;
        
        console.log('Loading the macOS Keyboard Navigation plugin.');
        this.registerDomEvent(document, 'keydown', function (keyboardPressEvent) {
            
            if ( !keyboardPressEvent.altKey && !keyboardPressEvent.ctrlKey && !keyboardPressEvent.metaKey && !keyboardPressEvent.shiftKey ) {
                if (keyboardPressEvent.key == "ArrowUp") {
                    var editor = _this.app.workspace.activeLeaf.view.sourceMode.cmEditor;
                    var cursorHead = editor.getCursor("head");
                    var cursorAnchor = editor.getCursor("anchor");
                    if (keyboardPressEvent.getModifierState("Shift")) { // select up
                        var doc = editor.getDoc();
                        if (cursorHead.ch != 0) {
                            doc.setSelection({ line: cursorAnchor.line, ch: cursorAnchor.ch }, { line: cursorHead.line, ch: 0 }, { scroll: true });
                        } else {
                            doc.setSelection({ line: cursorAnchor.line, ch: cursorAnchor.ch }, { line: cursorHead.line - 1, ch: 0 }, { scroll: true });
                        }
                    } else { // move up
                        if (cursorHead.ch != 0) { editor.setCursor(cursorHead.line, 0); } else { editor.setCursor((cursorHead.line - 1), 0); }
                    }
                }
            }
        });
        this.registerDomEvent(document, 'keydown', function (keyboardPressEvent) {
            if ( !keyboardPressEvent.getModifierState("Alt") && !keyboardPressEvent.getModifierState("Control") && !keyboardPressEvent.getModifierState("Meta") && !keyboardPressEvent.getModifierState("Shift") ) {
                if (keyboardPressEvent.key == "ArrowDown") {
                    var editor = _this.app.workspace.activeLeaf.view.sourceMode.cmEditor;
                    var cursorHead = editor.getCursor("head");
                    var cursorAnchor = editor.getCursor("anchor");
                    var doc = editor.getDoc();
                    var lineLength = doc.getLine(cursorHead.line).length;
                    if (keyboardPressEvent.getModifierState("Shift")) { // select down
                        console.log("alt and shift are held");
                        if (cursorHead.ch != lineLength) {
                            doc.setSelection({ line: cursorAnchor.line, ch: cursorAnchor.ch }, { line: cursorHead.line + 1, ch: 0 }, { scroll: true });
                        } else {
                            doc.setSelection({ line: cursorAnchor.line, ch: cursorAnchor.ch }, { line: cursorHead.line + 1, ch: 0 }, { scroll: true });
                        }
                    } else { // move down
                        if (cursorHead.ch != lineLength) { editor.setCursor(cursorHead.line, lineLength); } else { editor.setCursor((cursorHead.line + 1), doc.getLine(cursorHead.line + 1).length); }
                    }
                }
            }
        });
    };
    ContViewPlugin.prototype.onunload = function () { console.log('Unloading the macOS Keyboard Navigation plugin.'); };
    return ContViewPlugin;
}(obsidian.Plugin));

module.exports = ContViewPlugin;
