/*
	CanvasQuery (https://gist.github.com/505139)
	============================================
	CanvasQuery is a very basic canvas helper that makes the default canvas API just a bit more bearable.
	Usage: var context = new CanvasQuery('myCanvasElementId').method().otherMethod();

	Chaining
	--------
	Almost all canvas methods as before, but are chainable. The following methods are not chainable because they return a value:
	isPointInPath(), measureText(), createImageData(), createLinearGradient(), createRadialGradient(), createPattern()

	Changed methods
	---------------
	beginPath() was changed to accept two optional x and y arguments that define where the new path begins.

	Setter and getter methods
	-------------------------
	set(property, value) sets the context property "property" to "value"
	set(propertyMap) sets the context properties in the property map to their respective values
	get(property) returns the value for the context property

	Canvas access
	-------------
	canvas() returns the canvas element associated with the CanvasQuery object

	Radiant calculator
	------------------
	toRad(deg) calulates degrees to radiant and returns the result

	Animation wrapper
	-----------------
	animate(callback) provides a shim for requestAnimationFrame()
*/


function CanvasQuery(c){
	"use strict";
	if(!(this instanceof CanvasQuery)) return new CanvasQuery(c)
	if(typeof c == "string"){
		var canvas = document.getElementById(c);
		if(!canvas) throw new Error("Canvas element #" + c + " doesn't exist");
	}
	if(typeof canvas == "undefined"){
		if(c.getContext) canvas = c;
		else throw new Error("Object " + c + " is not a canvas element");
	}
	this.context = canvas.getContext("2d");
}


CanvasQuery.prototype = (function(){
	"use strict";
	var self    = {};
	var methods = ["arc", "arcTo", "bezierCurveTo", "clearRect", "clip", "closePath", "createImageData", "createLinearGradient", "createRadialGradient", "createPattern", "drawImage", "fill", "fillRect", "fillText", "getImageData", "isPointInPath", "lineTo", "measureText", "moveTo", "putImageData", "quadraticCurveTo", "rect", "restore", "rotate", "save", "scale", "setTransform", "stroke", "strokeRect", "strokeText", "transform", "translate"];
	var reqAniFra = (function(){
		return window.requestAnimationFrame ||
			window.webkitRequestAnimationFrame ||
			window.mozRequestAnimationFrame ||
			window.oRequestAnimationFrame ||
			window.msRequestAnimationFrame ||
			function(callback){
				setTimeout(callback, 1000 / 60);
			}
	})();
	for(var i = 0; i < methods.length; i++){
		var method = methods[i];
		self[method] = (function(method){
			return function(){
				var args = Array.prototype.slice.call(arguments);
				return this.context[method].apply(this.context, args) || this;
			}
		})(method);
	}
	self.beginPath = function(x, y){
		this.context.beginPath();
		if(arguments.length == 2) this.moveTo(x, y);
		return this;
	}
	self.set = function(property, value){
		if(typeof property == "string"){
			this.context[property] = value;
		}
		else {
			for(var prop in property){
				if(property.hasOwnProperty(prop)){
					this.context[prop] = property[prop];
				}
			}
		}
		return this;
	}
	self.get = function(property){
		return this.context[property];
	}
	self.canvas = function(){
		return this.context.canvas;
	}
	self.toRad = function(deg){
		return (deg * Math.PI) / 180;
	}
	self.animate = function(callback){
		reqAniFra(callback.bind(this));
		return this;
	}
	return self;
})();