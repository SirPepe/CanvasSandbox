// Public vars and functions
var canvas, context, findPos;
Math.toRad = function(x){
	return (x * Math.PI) / 180;
};

window.addEventListener('DOMContentLoaded', function(){
"use strict";

// DOM convenience functions
var $ = function(id){
	return document.getElementById(id);
};
var $$ = function(className){
	return document.getElementsByClassName(className);
};

// DOM elements
canvas = $('canvas0');
context = canvas.getContext('2d');
var textarea     = $('query'),
    execute      = $('execute'),
    reset        = $('reset'),
    posX         = $('posX'),
    posY         = $('posY'),
    fontsize     = $('EditorFontSize');

// Create editor
var editor = CodeMirror.fromTextArea(textarea, {
	mode: 'javascript',
	theme: 'neat',
	indentUnit: 4,
	lineNumbers: true
});

// Get settings recovery value. Retuns the value for the specified key or the whole
// settings object
var recoverSettings = function(){
	var key = arguments[0],
	    settings = JSON.parse(window.localStorage.getItem('settingsRecovery')) || {};
	if(typeof key !== 'undefined'){
		return settings[key];
	}
	else {
		return settings;
	}
}

// Set settings recovery (JSON)
var saveSettings = function(key, value){
	var settings = JSON.parse(window.localStorage.getItem('settingsRecovery')) || {};
	settings[key] = value;
	window.localStorage.setItem('settingsRecovery', JSON.stringify(settings));
}

// Editor font size
var changesize = function(){
	var box = $$('CodeMirror')[0],
	    val = (fontsize.value && parseInt(fontsize.value) > 14) ? fontsize.value : 14;
	box.style.fontSize = val + 'px';
	saveSettings('fontsize', val);
};
fontsize.onkeyup = changesize;
fontsize.onchange = changesize;
fontsize.onclick = changesize;

// Stolen from http://www.quirksmode.org/js/findpos.html
findPos = function(obj) {
	var curleft = 0,
	    curtop = 0;
	if(obj.offsetParent){
		do {
			curleft += obj.offsetLeft;
			curtop  += obj.offsetTop;
		} while (obj = obj.offsetParent);
		return [curleft,curtop];
	}
};

// Show coordinates
canvas.onmousemove = function(evt){
	var x = evt.clientX + document.body.scrollLeft + document.documentElement.scrollLeft - findPos(canvas)[0],
	    y = evt.clientY + document.body.scrollTop  + document.documentElement.scrollTop  - findPos(canvas)[1];
	posX.innerHTML = x;
	posY.innerHTML = y;
};
canvas.onmouseout = function(){
	posX.innerHTML = posY.innerHTML = 'NA';
};

// Execute!
execute.onclick = function(){
	var val = editor.getValue();
	if(val){
		try {
			if(window.localStorage){
				window.localStorage.setItem('codeRecovery', val);
			}
			eval(val);
		}
		catch(e){
			window.alert(e);
		}
	}
};

// Reset!
reset.onclick = function(){
	canvas.width = canvas.width;
};

// Restore last session after reload
window.onload = function(){
	editor.focus();
	if(window.localStorage){
		// Restore code
		var restoredCode = window.localStorage.getItem('codeRecovery');
		if(restoredCode && editor.getValue() == ''){
			editor.setValue(restoredCode);
		}
		// Restore font size and strict mode settings
		var restoredSettings = recoverSettings();
		var size = restoredSettings.fontsize || 14;
		fontsize.value = size;
		changesize();
	}
};

}, false);