define(['jquery', 'codemirror'], function($){

  var save = function(editor, key){
    var contents = editor.getValue();
    window.localStorage.setItem(key, contents);
    return editor;
  };

  var restore = function(editor, key){
    var contents = window.localStorage.getItem(key);
    if(contents){
      editor.setValue(contents);
    }
    return editor;
  };

  return function(editors){
    return Object.keys(editors).map(function(id){
      var storageKey = 'CanvasSandbox#' + id;
      var textarea = $('#' + id)[0];
      var options = editors[id];
      var editor = window.CodeMirror.fromTextArea(textarea, options);
      editor.saveValue = save.bind(null, editor, storageKey);
      editor.restoreValue = restore.bind(null, editor, storageKey);
      $(window).ready(function(){
        if(editor.getValue() == ''){
          editor.restoreValue();
        }
      });
      return editor;
    });
  };

});