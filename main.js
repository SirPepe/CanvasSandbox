/*jshint browser:true */
/*globals SandboxEditor:true */

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
	var curleft = 0,
	    curtop = 0;
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
	var x = evt.clientX + document.body.scrollLeft + document.documentElement.scrollLeft - findPos(canvas)[0],
	    y = evt.clientY + document.body.scrollTop  + document.documentElement.scrollTop  - findPos(canvas)[1];
	posX.innerHTML = x;
	posY.innerHTML = y;
};
canvas.onmouseout = function(){
	posX.innerHTML = posY.innerHTML = 'NA';
};

// Execute the code
execute.onclick = function(){
	var val = editors[0].getValue();
	if(val){
		try {
			SandboxEditor.save();
			eval(val);
		}
		catch(e){
			window.alert(e);
		}
	}
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