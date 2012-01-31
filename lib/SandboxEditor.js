/*globals CodeMirror:true */

// Create a new Sandbox Editor
var SandboxEditor = function(editors, size_input, instance_key){

// Allow only one Sandbox editor per page
if(typeof SandboxEditor.instance !== 'undefined'){
	return SandboxEditor.instance.editors;
}

// The instance key is used as a prefix for web storage keys. This allows multiple
// sandbox pages to use web storage on the same
if(typeof instance_key === 'undefined'){
	instance_key = window.location.href;
}

// Even if there's only one editor use an array for them
if(Object.prototype.toString.call(editors) !== '[object Array]'){
	editors = [editors];
}

// Find out if an object is a DOM object or not. It it's a string, to to match it
// to an id in the document. Returns the object or false.
var DOMinate = function(obj){
	if(obj === null){
		return false;
	}
	switch(typeof obj){
		case 'string': return DOMinate(document.getElementById(obj));
		case 'undefined': return false;
		case 'object': return obj;
	}
};

// Create all the editors as CodeMirror instances
var sandbox_editors = [];
editors.forEach(function(editor){
	var textarea = DOMinate(editor.textarea);
	sandbox_editors.push(CodeMirror.fromTextArea(textarea, editor.options));
});

// If there's a size input object, tie the editor's font sizes to the input's value
var changeSize;
size_input = DOMinate(size_input);
if(size_input){
	changeSize = function(){
		sandbox_editors.forEach(function(editor){
			var box = editor.getWrapperElement(),
			    val = (size_input.value && parseInt(size_input.value, 10) > 14) ? size_input.value : 14;
			box.style.fontSize = val + 'px';
		});
	};
	size_input.addEventListener('keyup', changeSize, false);
	size_input.addEventListener('change', changeSize, false);
	size_input.addEventListener('click', changeSize, false);
	window.addEventListener('load', changeSize, false);
}

// Restore the sandbox state
var restore = function(){
	if(window.localStorage){
		// Restore editors
		sandbox_editors.forEach(function(editor, num){
			var key   = instance_key + '_editor_' + num,
			    value = window.localStorage.getItem(key);
			if(value){
				editor.setValue(value);
			}
		});
		// Save font size
		if(size_input){
			var value = window.localStorage.getItem(instance_key + '_font');
			if(value){
				size_input.value = value;
			}
		}
	}
};

// Save the current sandbox state
var save = function(){
	if(window.localStorage){
		// Save editors
		sandbox_editors.forEach(function(editor, num){
			var key   = instance_key + '_editor_' + num,
			    value = editor.getValue();
			window.localStorage.setItem(key, value);
		});
		// Save font size
		if(size_input){
			var value = (size_input.value >= 14) ? size_input.value : 14;
			window.localStorage.setItem(instance_key + '_font', value);
		}
	}
};

// Expose the save method as a public static function
SandboxEditor.save = save;

// Restore last session after reload
window.addEventListener('load', function(){
	restore();
	if(size_input && !size_input.value){
		size_input.value = 14;
	}
	changeSize();
}, false);

// Set the instance
SandboxEditor.instance = this;

// Return the editors
return sandbox_editors;

};