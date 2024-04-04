# obsidian-continuous-mode

An Obsidian plugin that displays all open notes in a tab group as if they were a single continuous document (sometimes called "Scrivenings mode").  

## Features:  

#### File and Editor Contextual Menus, Command Palette:  
 - Toggle continuous mode in active tab group.  
 - Show/hide note headers in active tab group.  

#### File Explorer Contextual Menu:  
The File Explorer contextual menu provides several options for opening all the contents of the selected folder in Continuous Mode:  
 - Open files in new split (left, right, up, down).
 - Open or append files in active tab group; files will not be duplicated if they are already open.  
 - Replace files in active tab group with files from the selected folder (i.e., close all open notes in active tab group and replace with folder items).  
Exclude/include folder files by type (e.g., markdown, images, canvas, etc.), extension, or file name in the Settings.  
Note: opening folders is not recursive—only the top level notes will be opened.
 
#### Other functions:  
 - Automatically save and restore continuous mode tab group settings when shutting down/starting up Obsidian.  
 - Navigate between notes with up and down arrow keys (and left and right arrow keys if at the beginning or end of the note).  
   - Also use left and right arrow keys to scroll html notes or jump from page to page in pdfs.  
   - If editing a canvas file (i.e., canvas leaf is active), click the background to deselect any active node and use the up and down arrow keys to navigate to the adjacent note. 
   - Similarly use the arrow keys to navigate out of an active graph view. Use shift+arrow keys to move the graph around.   
 - Notes scroll into view when tab header is clicked.
 - Reorder notes in tab group via tab header drag-and-drop.
 
#### User Settings:
- “Open folder in Continuous Mode” menu options: Exclude or include folder files by type (e.g., markdown, images, canvas, etc.), extension, or file name.  
- “Clear stored data”: Empty the list of stored tab groups, ignoring currently open tab groups with continuous mode active. This optional action prevents the list from getting unwieldy or cluttered with stale data, which can happen if you frequently open and close new tab groups.
- Donate link.
 
#### Notes:
 - If you use the "Open folder in Continuous Mode" functions to open all the notes in a folder, the tab group will not reflect any changes you make to the folder structure in the file explorer. If you do make any changes (e.g., move, create, or delete a note), you'll have to reopen the folder to see the updated structure.

### Buy me a coffee:

<a href="https://www.buymeacoffee.com/fiLtliTFxQ" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 40px !important;" ></a>

## Screenshots:

![<# After #>](assets/after.gif "after.gif")

