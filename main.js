/*jshint browser:true */
/*globals SandboxEditor:true, key:true; */

// Public vars and functions
var canvas, context, findPos;

Math.toRad = function(x){
	return (x * Math.PI) / 180;
};

window.requestAnimationFrame = window.requestAnimationFrame || (function(){
	return window.webkitRequestAnimationFrame ||
			window.mozRequestAnimationFrame    ||
			window.oRequestAnimationFrame      ||
			window.msRequestAnimationFrame     ||
			function(callback){
				window.setTimeout(callback, 1000 / 60);
			};
})();

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
canvas  = $('Canvas0');
context = canvas.getContext('2d');
var execute  = $('Execute'),
    reset    = $('Reset'),
    posX     = $('PosX'),
    posY     = $('PosY');

// Initalize the editor and it's font size control element
var editors = new SandboxEditor({
	textarea: 'Query',
	options: {
		mode: 'javascript',
		theme: 'neat',
		indentUnit: 4,
		lineNumbers: true
	}
}, 'FontSize', 'CanvasSandbox');

// Stolen from http://www.quirksmode.org/js/findpos.html
findPos = function(obj) {
	var curleft = 0;
	var curtop = 0;
	if(obj.offsetParent){
		do {
			curleft += obj.offsetLeft;
			curtop  += obj.offsetTop;
			obj = obj.offsetParent;
		} while (obj);
		return [curleft,curtop];
	}
};

// Show coordinates
canvas.onmousemove = function(evt){
	var x = evt.clientX + document.body.scrollLeft + document.documentElement.scrollLeft - findPos(canvas)[0];
	var y = evt.clientY + document.body.scrollTop  + document.documentElement.scrollTop  - findPos(canvas)[1];
	posX.innerHTML = x;
	posY.innerHTML = y;
};
canvas.onmouseout = function(){
	posX.innerHTML = posY.innerHTML = 'NA';
};

// Execute the code
var exec_code = function(){
	var val = editors[0].getValue();
	if(val){
		try {
			SandboxEditor.save();
			new Function(val).call(); // Allow the code in `val` to use the outer `$` from jQuery
		}
		catch(e){
			window.alert(e + "\nDetails in der Konsole");
			if(typeof window.console){
				window.console.log(e);
			}
		}
	}
};
execute.onclick = exec_code;


// Execute on keypress
key('ctrl+s, ctrl+enter', function(){
	exec_code();
	return false;
});

// Override keymaster's regular filter function to catch keypress events in the textarea
key.filter = function(){
	var tagName = (event.target || event.srcElement).tagName;
	return !(tagName == 'INPUT' || tagName == 'SELECT' /*|| tagName == 'TEXTAREA'*/);
};

// Reset the canvas element
reset.onclick = function(){
	canvas.width = canvas.width;
};

// Focus the first editor on reload
window.addEventListener('load', function(){
	editors[0].focus();
}, false);

}, false);