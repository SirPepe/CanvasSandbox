require([
  'jquery',
  'bacon',
  'lib/createEditor',
  'lib/keymaster/keymaster.js',
  'lib/jshint',
  'lib/globals',
  'lib/codemirror/mode/javascript/javascript',
  'lib/codemirror/addon/edit/matchbrackets',
  'lib/codemirror/addon/selection/active-line',
  'lib/codemirror/addon/lint/lint',
  'lib/codemirror/addon/lint/javascript-lint'
], function($, bacon, createEditor){


// Setup canvas and editors
var $canvas = $('canvas');
window.canvas = $('canvas')[0];
window.context = $('canvas')[0].getContext('2d');
var editor = createEditor({
  Code: {
    mode: 'javascript',
    theme: 'neat',
    tabSize: 2,
    indentUnit: 2,
    indentWithTabs: false,
    lineNumbers: true,
    matchBrackets: true,
    styleActiveLine: true,
    gutters: ['CodeMirror-lint-markers'],
    lintWith: CodeMirror.javascriptValidator
  }
})[0];


// Event streams for mousemove and mouseout events to display current
// canvas coordinates
bacon.mergeAll([
  $canvas.asEventStream('mousemove', function(evt){
    var offset = $canvas.offset();
    var x = evt.clientX - offset.left;
    var y = evt.clientY - offset.top;
    return { x: x, y: y };
  }),
  $canvas.asEventStream('mouseout', function(){
    return { x: null, y: null };
  })
]).onValue(function(pos){
  $('#PosX').text(pos.x || 'NA');
  $('#PosY').text(pos.y || 'NA');
});


var runCode = function(){
  editor.saveValue();
  var value = editor.getValue();
  if(value){
    try {
      new Function(value)();
    }
    catch(err){
      window.alert(err + "\n(Details in der Konsole)");
      throw err;
    }
  }
  return false;
};
window.key.filter = function(){ return true; };
window.key('ctrl+s, ctrl+enter', runCode);
$('#Execute').click(runCode);


// Delete canvas contents and reset transformation matrix
$('#Reset').click(function(){
  window.context.setTransform(1, 0, 0, 1, 0, 0);
  window.context.clearRect(0, 0, window.canvas.width, window.canvas.height);
});


// Save after typing
editor.on('keyup', (function(){
  var result;
  var timeout = null;
  return function(){
    var later = function(){
      timeout = null;
      editor.saveValue();
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, 1000);
    if(!timeout){
      editor.saveValue();
    }
  };
})());


// Set canvas size via html attribute after page load
var resizeCanvas = function(){
  var height = $('html').height() - $('.CodeMirror').height() - 32;
  var width = $('#Main').width();
  $('canvas').attr({
    height: height,
    width: width
  });
};
$(window).load(function(){
  setTimeout(function(){ // Hack required for Firefox
    resizeCanvas();
  }, 25);
});
$(window).on('resize', resizeCanvas);


});