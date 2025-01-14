# obsidian-continuous-mode

![GitHub manifest version](https://img.shields.io/github/manifest-json/v/gasparschott/obsidian-continuous-mode) ![GitHub all releases](https://img.shields.io/github/downloads/gasparschott/obsidian-continuous-mode/total)

## Table of Contents  
- [Introduction](#introduction)  
- [Usage](#usage)  
	1. [Basic Example](#basic-example)  
	3. [Contextual Menus](#contextual-menus)  
	4. [Opening Multiple Items](#opening-multiple-items)  
	5. [Compact Mode](#compact-mode)  
- [Commands](#commands)  
- [Other Functions](#other-functions)  
- [The Settings Window](#the-settings-window)  
	5. [Maximum number of items to open at one time](#maximum-number-of-items-to-open-at-one-time)  
	6. [Allow single click to open File Explorer folders in Continuous Mode](#allow-single-click-to-open-file-explorer-folders-in-continuous-mode)  
- [Continuous Mode and other Plugins](#continuous-mode-and-other-plugins)  
- [Troubleshooting](#troubleshooting)  

## Introduction
A plugin for Obsidian that displays all open notes in a tab group as if they were a continuous scrollable document (sometimes called “Scrivenings mode”). Continuous Mode is available for notes in the Main Split and panes in the Sidebars. The plugin also allows keyboard navigation between notes, and provides several ways to open multiple notes at a time from the File Explorer, search results, document links, or dataview/query blocks.

### <a href="https://www.buymeacoffee.com/fiLtliTFxQ" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 40px !important;" ></a>

## Usage:  

### Basic Example
With multiple notes already open, you can use the contextual menu to toggle Continuous Mode in the active tab group and to toggle visibility of note headers; you can scroll notes into view by clicking the tab or making the note active:

<img src="assets/01-basic.gif" style="width:672px;" alt="Basic usage example" />

### Contextual Menus

This plugin adds a “Continuous Mode” menu item to the contextual menus available in various parts of the Obsidian UI. The position of the menu item and the available options differ according to the...er...context.

#### Basic Functions

These menu items are available in the Tab Group Menu, File Menu, Selected Tab Menu, and Editor Menus.  

<img src="assets/menu-basic-1.png" style="width:229px;" alt="Tab Group Menu" />  

##### Change sort order submenu   

<img src="assets/menu-sort.png" style="width:197px;" alt="Change sort order" />  


#### Opening Multiple Items  

In other contexts, the menu will include options to allow you to open multiple items in Continuous Mode. 

<img src="assets/menu-open-folder.png" style="width:307px;" alt="Folder Menu" />  

This menu will show “file,” “document links,” “query block links,” “search results” instead of “folder contents” depending on the context. You can:
- Open items in a new split (left, right, up, down).  
- Open or append items in the active tab group; files will not be duplicated if they are already open.  
- Replace files in the active tab group with files from the selected folder (i.e., close all open notes in active tab group and replace with folder items).  

See the Settings for options to:
	- Filter (include or exclude) the folder items that are opened by type (e.g., markdown, images, canvas, etc.), extension, or file name;  
	- Set the number of items to open at one time;  
	– Set the sorting order when opening multiple items.
	- Open File Explorer folder contents with one click.  

**Notes:**   
	- Opening folders is not recursive—only the top level notes in the folder will be opened.  
	– You can select multiple non-consecutive files (but not [yet?] folders) in the File Explorer (Alt/Opt + Click) and open them via the context menu.
	- Sort order of the source (e.g., File Explorer, Search Results) is respected when opening multiple items. Once opened, sort order does not dynamically update when it is changed in the file explorer; reopen the folder in Continuous Mode to accomplish this or change the sort order via the tab group menu. In the Settings you can choose the default sort order when opening multiple items.  
	- Similarly, after opening multiple files, the tab group will not dynamically reflect any changes you make to the folder structure in the file explorer. If you do make any changes (e.g., move, create, or delete a note), you'll have to reopen the folder to see the updated structure.

### Compact Mode  
Compact Mode emulates the note preview sidebar found in apps like Bear or Evernote.

Compact Mode  
<img src="assets/compact-mode.png" style="width:621px;" alt="Compact Mode" /> 

Semi-Compact Mode  
<img src="assets/semi-compact-mode.png" style="width:621px;" alt="Semi-Compact Mode" />  
 	- When Compact Mode is active, the left split will preview the first few lines of each open note (or a thumbnail for images). Clicking a preview or otherwise making it active will open the note in the right sidebar.  
	- When Semi-Compact Mode is active, the active note will be displayed normally.  
	- Compact Mode notes can be navigated with the arrow keys.  
	- Added user settings to open clicked file explorer folders or files in compact mode.  
	- Note: You may wish to disable the Obsidian editor setting ```Always focus new tabs``` to allow continuous arrow navigation of Compact View items.  

## Commands
Many of the above functions can be invoked via the Command Palette.

## Keyboard navigation in and between notes  
In Continuous Mode you can navigate between notes with the up and down arrow keys, and with the left and right arrow keys if the cursor is at the beginning or end of the note.  
	- In pdfs, the left and right arrow keys will jump from page to page.
	- In HTML files, the left and right arrow keys will scroll the page.
	- In an active canvas leaf, click the background to deselect any active node and use the up and down arrow keys to navigate to the adjacent note.  
	- In an active graph view, similarly use the arrow keys to navigate to the adjacent note. Use ```shift + arrow``` keys to move the graph around.   
	- While editing notes, the insertion point will scroll so as to remain more or less in the center of the screen, similar to “typewriter mode”; this behavior can be disabled in the settings.  

## Other functions  
	- Notes will scroll into view when you click the tab header. Note: this may fail when clicking tab headers for the first time after start-up, and before the note has been scrolled into view at least once; this appears to be an issue with Obsidian.  
	- Clicking a line in a note will scroll that line into view.
	- You can reorder notes in a tab group by dragging and dropping the tab headers.  
	- Automatically save and restore continuous mode tab group settings when shutting down/starting up Obsidian.  

## The Settings Window

<img src="assets/settings.png" style="width:621px;" alt="Settings window" />  

- Maximum number of items to open at one time: Leave empty (or set to 0) to open all items at once. Otherwise, setting a value here allows you to incrementally open the items in a folder (or search results or document links) by repeatedly selecting “Open or append items in Continuous Mode.” This is useful for dealing with folders containing a large number of items.  
- Allow single click to open File Explorer folders in Continuous Mode: Enable this setting to make it possible to open the items in a File Explorer folders with a single click. Set the default single click action below.  

## Continuous Mode and other Plugins  
The Continuous Mode menus are available or compatible with the following third-party plugins, which add to or modify the File Explorer or provide new file views:

- “<a href="https://obsidian.md/plugins?id=file-tree-alternative" target="_blank">File Tree Alternative</a>” plugin.  
- “<a href="https://github.com/Quorafind/Outliner.MD" target="_blank">Outliner.MD</a>” plugin.  
- “<a href="https://obsidian.md/plugins?id=longform" target="_blank">Longform</a>” plugin. Basic support: Files are opened in their project or scene order (i.e. not alphabetically); however, tab order is not automatically refreshed when the project order is changed, nor are new files automatically opened when new scenes are created. While technically feasible, there are too many variables to make this work predictably. Instead, open the project again in Continuous Mode using the "replace" option.

**Conflicts:**
- “<a href="https://obsidian.md/plugins?id=folder-notes" target="_blank">Folder Notes</a>”: There is a conflict with the Folder Notes plugin and the "Single click to open file explorer items" action in Continuous Mode whereby Folder Notes captures mouse clicks on file explorer folders, preventing the action from succeeding. A possible solution is to change the “Key for creating folder note” and “Key for opening folder note” settings to ```Cmd+Click``` or ```Alt+Cmd```.
- “<a href="https://github.com/oxdc/obsidian-vertical-tabs" target="_blank">Vertical Tabs</a>”: This plugin can prevent opening "Compact Mode" previews in the right split. The solution is to change the Vertical Tabs “Navigation strategy” setting from “Obsidian+” to “Obsidian”.

If you find that Continuous Mode interferes with or doesn’t work properly with a particular plugin, please let me know.


## Troubleshooting
- “No readable files found”: If you know that there are readable files in the source you are trying to open, check the plugin settings to make sure that the “Filter file types” are set to include the file types. If you are attempting to open document or query block links, check that the links are valid and point to existing files.

