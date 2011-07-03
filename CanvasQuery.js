function CanvasQuery(c){
    var canvas;
    if(!(this instanceof CanvasQuery)){
        return new CanvasQuery(c)
    }
    if(typeof c == 'string'){
        canvas = document.getElementById(c);
        if(!canvas){
            throw new Error('Canvas element #' + c + ' doesn\'t exist');
        }
    }
    if(!canvas){
        if(c.getContext){
            canvas = c;
        }
        else {
            throw new Error('Object ' + c + ' is not a canvas element');
        }
    }
    this.context = canvas.getContext('2d');
    var methods = 'arc|arcTo|beginPath|bezierCurveTo|clearRect|clip|closePath|createImageData|createLinearGradient|createRadialGradient|createPattern|drawImage|fill|fillRect|fillText|getImageData|isPointInPath|lineTo|measureText|moveTo|putImageData|quadraticCurveTo|rect|restore|rotate|save|scale|setTransform|stroke|strokeRect|strokeText|transform|translate'.split('|');
    var reqAniFra = (function(){
        return window.requestAnimationFrame    ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.oRequestAnimationFrame      ||
            window.msRequestAnimationFrame     ||
            function(callback){
                setTimeout(callback, 1000 / 60);
            };
    })();
    return function(){
        for(var i = 0; i < methods.length; i++){ // Alle normalen Canvas-Methoden
            var method = methods[i];
            CanvasQuery.prototype[method] = (function(method){
                return function(a, b, c, d, e, f, g, h, i){
                    if(/^isPointInPath|measureText|createImageData|createLinearGradient|createRadialGradient|createPattern$/.test(method)){ // Diese Methoden geben einen Wert zurück
                        return this.context[method](a, b, c, d, e, f, g, h, i);
                    }
                    else { // Alle anderen können verkettet werden
                        this.context[method](a, b, c, d, e, f, g, h, i);
                        return this;
                    }
                };
            })(method);
        }
        CanvasQuery.prototype['set'] = (function(){ // Allgemeiner Setter
            return function(property, value){
                if(typeof property == 'string'){
                    this.context[property] = value;
                }
                else {
                    for(prop in property){
                        if(property.hasOwnProperty(prop)){
                            this.context[prop] = property[prop];
                        }
                    }
                }
                return this;
            };
        })();
        CanvasQuery.prototype['get'] = (function(){ // Allgemeiner Getter
            return function(property){
                return this.context[property];
            };
        })();
        CanvasQuery.prototype['canvas'] = (function(){ // Gibt das Canvas-Objekt zurück
            return function(){
                return this.context.canvas;
            };
        })();
        CanvasQuery.prototype['deg2rad'] = (function(){ // Winkel-Umrechner
            return function(deg){
                return (deg * Math.PI) / 180;
            };
        })();
        CanvasQuery.prototype['animate'] = (function(){ // Animations-Wrapper
            return function(callback){
                reqAniFra(callback.bind(this));
                return this;
            };
        })();
    }();
}
