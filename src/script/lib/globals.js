define(function(){

  window.Math.toRad = function(x){
    return (x * Math.PI) / 180;
  };

  window.requestAnimationFrame = window.requestAnimationFrame || (function(){
    return window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.oRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      function(callback){
        window.setTimeout(callback, 1000 / 60);
      };
  })();

});