# obsidian-continuous-mode

Displays all open notes in a tab group as if they were a continuous scrollable document (sometimes called “Scrivenings mode”). Open all notes in Continuous Mode from a folder, search results, or links in a file or Dataview/query block; use arrow keys to navigate between notes; reorder notes via tab header drag-and-drop, sorting, more.

## Features:  

- File explorer menu: Open all items in selected folder in Continuous Mode.  
- File explorer menu: Open selected files in Continuous Mode.  
- Search results menu: Open all search results in Continuous Mode.  
- Search results menu: Open selected files in Continuous Mode.  
- File Mene/Editor Menu: Open all links from Dataview and Query blocks in Continuous Mode. (Limitation: not available in floating windows.)
- File Menu/Editor Menu: Open all document links (not in Dataview or Query blocks) in Continuous Mode.

#### File and Editor Contextual Menus, Command Palette:  
- Toggle continuous mode in active tab group.  
- Show/hide note headers in active tab group.  

#### File Explorer and Search Results menus:
The File Explorer contextual menu and the Search Result menu provide options for opening the contents of the selected folder or the search results in Continuous Mode:  
- Open items in new split (left, right, up, down).  
- Open or append items in active tab group; files will not be duplicated if they are already open.  
- Replace files in active tab group with files from the selected folder (i.e., close all open notes in active tab group and replace with folder items).  
Filter folder files by type (e.g., markdown, images, canvas, etc.), extension, or file name in the Settings.  
Sort order is respected when opening folders. Once opened, sort order does not update when it is changed in the file explorer; reopen the folder in Continuous Mode to accomplish this.  
Opening folders is not recursive—only the top level notes will be opened.  
 
#### Other functions:  
- Automatically save and restore continuous mode tab group settings when shutting down/starting up Obsidian.  
- Navigate between notes with up and down arrow keys (and left and right arrow keys if at the beginning or end of the note).  
   - Also use left and right arrow keys to scroll html notes or jump from page to page in pdfs.  
   - If editing a canvas file (i.e., canvas leaf is active), click the background to deselect any active node and use the up and down arrow keys to navigate to the adjacent note.  
   - Similarly use the arrow keys to navigate out of an active graph view. Use shift+arrow keys to move the graph around.   
- While editing notes, the insertion point will scroll so as to remain more or less in the center of the screen, similar to “typewriter mode”; this behavior can be disabled in the settings.  
- Scroll notes into view by clicking the tab header. Note: scroll into view fails when clicking the tab headers the first time, and before the note has been scrolled into view at least once. This appears to be an issue with Obsidian.  
- Reorder notes in tab group via tab header drag-and-drop.  
 
#### User Settings:
- “Allow single click to open folder items in Continuous Mode”: Enable this setting to make it possible to open all items in File Explorer folder with a click. Select option for default action: open folder in new split left, right, down, up, or append or replace.
- “Open folder in Continuous Mode” menu options: Filter folder files by type (e.g., markdown, images, canvas, media, pdf), custom extensions, or file name. Option to exclude embedded files.  
- “Clear stored data”: Empty the list of stored tab groups, ignoring currently open tab groups with continuous mode active. This optional action prevents the list from getting unwieldy or cluttered with stale data, which can happen if you frequently open and close new tab groups.
- Disable scroll active leaf into view: If you find the plugin’s default scroll behavior on arrow navigation (which keeps the insertion point more or less centered by line/paragraph, similar to “typewriter mode”) distracting, enable this setting. Clicking tab headers will still scroll notes into view.
- Donate link.
 
#### Notes:
 - If you use the "Open folder in Continuous Mode" functions to open all the notes in a folder, the tab group will not reflect any changes you make to the folder structure in the file explorer. If you do make any changes (e.g., move, create, or delete a note), you'll have to reopen the folder to see the updated structure.

### Buy me a coffee:

<a href="https://www.buymeacoffee.com/fiLtliTFxQ" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 40px !important;" ></a>

## Screenshots:

![<# After #>](assets/after.gif "after.gif")

