
/**
 * almond 0.2.5 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("almond", function(){});

/*!
 * jQuery JavaScript Library v1.9.1
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2012 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2013-2-4
 */
(function( window, undefined ) {

// Can't do this because several apps including ASP.NET trace
// the stack via arguments.caller.callee and Firefox dies if
// you try to trace through "use strict" call chains. (#13335)
// Support: Firefox 18+
//
var
	// The deferred used on DOM ready
	readyList,

	// A central reference to the root jQuery(document)
	rootjQuery,

	// Support: IE<9
	// For `typeof node.method` instead of `node.method !== undefined`
	core_strundefined = typeof undefined,

	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,
	location = window.location,

	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$,

	// [[Class]] -> type pairs
	class2type = {},

	// List of deleted data cache ids, so we can reuse them
	core_deletedIds = [],

	core_version = "1.9.1",

	// Save a reference to some core methods
	core_concat = core_deletedIds.concat,
	core_push = core_deletedIds.push,
	core_slice = core_deletedIds.slice,
	core_indexOf = core_deletedIds.indexOf,
	core_toString = class2type.toString,
	core_hasOwn = class2type.hasOwnProperty,
	core_trim = core_version.trim,

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		return new jQuery.fn.init( selector, context, rootjQuery );
	},

	// Used for matching numbers
	core_pnum = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,

	// Used for splitting on whitespace
	core_rnotwhite = /\S+/g,

	// Make sure we trim BOM and NBSP (here's looking at you, Safari 5.0 and IE)
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	rquickExpr = /^(?:(<[\w\W]+>)[^>]*|#([\w-]*))$/,

	// Match a standalone tag
	rsingleTag = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,

	// JSON RegExp
	rvalidchars = /^[\],:{}\s]*$/,
	rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g,
	rvalidescape = /\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g,
	rvalidtokens = /"[^"\\\r\n]*"|true|false|null|-?(?:\d+\.|)\d+(?:[eE][+-]?\d+|)/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return letter.toUpperCase();
	},

	// The ready event handler
	completed = function( event ) {

		// readyState === "complete" is good enough for us to call the dom ready in oldIE
		if ( document.addEventListener || event.type === "load" || document.readyState === "complete" ) {
			detach();
			jQuery.ready();
		}
	},
	// Clean-up method for dom ready events
	detach = function() {
		if ( document.addEventListener ) {
			document.removeEventListener( "DOMContentLoaded", completed, false );
			window.removeEventListener( "load", completed, false );

		} else {
			document.detachEvent( "onreadystatechange", completed );
			window.detachEvent( "onload", completed );
		}
	};

jQuery.fn = jQuery.prototype = {
	// The current version of jQuery being used
	jquery: core_version,

	constructor: jQuery,
	init: function( selector, context, rootjQuery ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;

					// scripts is true for back-compat
					jQuery.merge( this, jQuery.parseHTML(
						match[1],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {
							// Properties of context are called as methods if possible
							if ( jQuery.isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE and Opera return items
						// by name instead of ID
						if ( elem.id !== match[2] ) {
							return rootjQuery.find( selector );
						}

						// Otherwise, we inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return rootjQuery.ready( selector );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	},

	// Start with an empty selector
	selector: "",

	// The default length of a jQuery object is 0
	length: 0,

	// The number of elements contained in the matched element set
	size: function() {
		return this.length;
	},

	toArray: function() {
		return core_slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num == null ?

			// Return a 'clean' array
			this.toArray() :

			// Return just the object
			( num < 0 ? this[ this.length + num ] : this[ num ] );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;
		ret.context = this.context;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	ready: function( fn ) {
		// Add the callback
		jQuery.ready.promise().done( fn );

		return this;
	},

	slice: function() {
		return this.pushStack( core_slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[j] ] : [] );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: core_push,
	sort: [].sort,
	splice: [].splice
};

// Give the init function the jQuery prototype for later instantiation
jQuery.fn.init.prototype = jQuery.fn;

jQuery.extend = jQuery.fn.extend = function() {
	var src, copyIsArray, copy, name, options, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// extend jQuery itself if only one argument is passed
	if ( length === i ) {
		target = this;
		--i;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	noConflict: function( deep ) {
		if ( window.$ === jQuery ) {
			window.$ = _$;
		}

		if ( deep && window.jQuery === jQuery ) {
			window.jQuery = _jQuery;
		}

		return jQuery;
	},

	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
		if ( !document.body ) {
			return setTimeout( jQuery.ready );
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.trigger ) {
			jQuery( document ).trigger("ready").off("ready");
		}
	},

	// See test/unit/core.js for details concerning isFunction.
	// Since version 1.3, DOM methods and functions like alert
	// aren't supported. They return false on IE (#2968).
	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray || function( obj ) {
		return jQuery.type(obj) === "array";
	},

	isWindow: function( obj ) {
		return obj != null && obj == obj.window;
	},

	isNumeric: function( obj ) {
		return !isNaN( parseFloat(obj) ) && isFinite( obj );
	},

	type: function( obj ) {
		if ( obj == null ) {
			return String( obj );
		}
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ core_toString.call(obj) ] || "object" :
			typeof obj;
	},

	isPlainObject: function( obj ) {
		// Must be an Object.
		// Because of IE, we also have to check the presence of the constructor property.
		// Make sure that DOM nodes and window objects don't pass through, as well
		if ( !obj || jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		try {
			// Not own constructor property must be Object
			if ( obj.constructor &&
				!core_hasOwn.call(obj, "constructor") &&
				!core_hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
				return false;
			}
		} catch ( e ) {
			// IE8,9 Will throw exceptions on certain host objects #9897
			return false;
		}

		// Own properties are enumerated firstly, so to speed up,
		// if last one is own, then all properties are own.

		var key;
		for ( key in obj ) {}

		return key === undefined || core_hasOwn.call( obj, key );
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	error: function( msg ) {
		throw new Error( msg );
	},

	// data: string of html
	// context (optional): If specified, the fragment will be created in this context, defaults to document
	// keepScripts (optional): If true, will include scripts passed in the html string
	parseHTML: function( data, context, keepScripts ) {
		if ( !data || typeof data !== "string" ) {
			return null;
		}
		if ( typeof context === "boolean" ) {
			keepScripts = context;
			context = false;
		}
		context = context || document;

		var parsed = rsingleTag.exec( data ),
			scripts = !keepScripts && [];

		// Single tag
		if ( parsed ) {
			return [ context.createElement( parsed[1] ) ];
		}

		parsed = jQuery.buildFragment( [ data ], context, scripts );
		if ( scripts ) {
			jQuery( scripts ).remove();
		}
		return jQuery.merge( [], parsed.childNodes );
	},

	parseJSON: function( data ) {
		// Attempt to parse using the native JSON parser first
		if ( window.JSON && window.JSON.parse ) {
			return window.JSON.parse( data );
		}

		if ( data === null ) {
			return data;
		}

		if ( typeof data === "string" ) {

			// Make sure leading/trailing whitespace is removed (IE can't handle it)
			data = jQuery.trim( data );

			if ( data ) {
				// Make sure the incoming data is actual JSON
				// Logic borrowed from http://json.org/json2.js
				if ( rvalidchars.test( data.replace( rvalidescape, "@" )
					.replace( rvalidtokens, "]" )
					.replace( rvalidbraces, "")) ) {

					return ( new Function( "return " + data ) )();
				}
			}
		}

		jQuery.error( "Invalid JSON: " + data );
	},

	// Cross-browser xml parsing
	parseXML: function( data ) {
		var xml, tmp;
		if ( !data || typeof data !== "string" ) {
			return null;
		}
		try {
			if ( window.DOMParser ) { // Standard
				tmp = new DOMParser();
				xml = tmp.parseFromString( data , "text/xml" );
			} else { // IE
				xml = new ActiveXObject( "Microsoft.XMLDOM" );
				xml.async = "false";
				xml.loadXML( data );
			}
		} catch( e ) {
			xml = undefined;
		}
		if ( !xml || !xml.documentElement || xml.getElementsByTagName( "parsererror" ).length ) {
			jQuery.error( "Invalid XML: " + data );
		}
		return xml;
	},

	noop: function() {},

	// Evaluates a script in a global context
	// Workarounds based on findings by Jim Driscoll
	// http://weblogs.java.net/blog/driscoll/archive/2009/09/08/eval-javascript-global-context
	globalEval: function( data ) {
		if ( data && jQuery.trim( data ) ) {
			// We use execScript on Internet Explorer
			// We use an anonymous function so that context is window
			// rather than jQuery in Firefox
			( window.execScript || function( data ) {
				window[ "eval" ].call( window, data );
			} )( data );
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var value,
			i = 0,
			length = obj.length,
			isArray = isArraylike( obj );

		if ( args ) {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Use native String.trim function wherever possible
	trim: core_trim && !core_trim.call("\uFEFF\xA0") ?
		function( text ) {
			return text == null ?
				"" :
				core_trim.call( text );
		} :

		// Otherwise use our own trimming functionality
		function( text ) {
			return text == null ?
				"" :
				( text + "" ).replace( rtrim, "" );
		},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike( Object(arr) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				core_push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		var len;

		if ( arr ) {
			if ( core_indexOf ) {
				return core_indexOf.call( arr, elem, i );
			}

			len = arr.length;
			i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;

			for ( ; i < len; i++ ) {
				// Skip accessing in sparse arrays
				if ( i in arr && arr[ i ] === elem ) {
					return i;
				}
			}
		}

		return -1;
	},

	merge: function( first, second ) {
		var l = second.length,
			i = first.length,
			j = 0;

		if ( typeof l === "number" ) {
			for ( ; j < l; j++ ) {
				first[ i++ ] = second[ j ];
			}
		} else {
			while ( second[j] !== undefined ) {
				first[ i++ ] = second[ j++ ];
			}
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, inv ) {
		var retVal,
			ret = [],
			i = 0,
			length = elems.length;
		inv = !!inv;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			retVal = !!callback( elems[ i ], i );
			if ( inv !== retVal ) {
				ret.push( elems[ i ] );
			}
		}

		return ret;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value,
			i = 0,
			length = elems.length,
			isArray = isArraylike( elems ),
			ret = [];

		// Go through the array, translating each of the items to their
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret[ ret.length ] = value;
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret[ ret.length ] = value;
				}
			}
		}

		// Flatten any nested arrays
		return core_concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var args, proxy, tmp;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = core_slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context || this, args.concat( core_slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	// Multifunctional method to get and set values of a collection
	// The value/s can optionally be executed if it's a function
	access: function( elems, fn, key, value, chainable, emptyGet, raw ) {
		var i = 0,
			length = elems.length,
			bulk = key == null;

		// Sets many values
		if ( jQuery.type( key ) === "object" ) {
			chainable = true;
			for ( i in key ) {
				jQuery.access( elems, fn, i, key[i], true, emptyGet, raw );
			}

		// Sets one value
		} else if ( value !== undefined ) {
			chainable = true;

			if ( !jQuery.isFunction( value ) ) {
				raw = true;
			}

			if ( bulk ) {
				// Bulk operations run against the entire set
				if ( raw ) {
					fn.call( elems, value );
					fn = null;

				// ...except when executing function values
				} else {
					bulk = fn;
					fn = function( elem, key, value ) {
						return bulk.call( jQuery( elem ), value );
					};
				}
			}

			if ( fn ) {
				for ( ; i < length; i++ ) {
					fn( elems[i], key, raw ? value : value.call( elems[i], i, fn( elems[i], key ) ) );
				}
			}
		}

		return chainable ?
			elems :

			// Gets
			bulk ?
				fn.call( elems ) :
				length ? fn( elems[0], key ) : emptyGet;
	},

	now: function() {
		return ( new Date() ).getTime();
	}
});

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// we once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready );

		// Standards-based browsers support DOMContentLoaded
		} else if ( document.addEventListener ) {
			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", completed, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", completed, false );

		// If IE event model is used
		} else {
			// Ensure firing before onload, maybe late but safe also for iframes
			document.attachEvent( "onreadystatechange", completed );

			// A fallback to window.onload, that will always work
			window.attachEvent( "onload", completed );

			// If IE and not a frame
			// continually check to see if the document is ready
			var top = false;

			try {
				top = window.frameElement == null && document.documentElement;
			} catch(e) {}

			if ( top && top.doScroll ) {
				(function doScrollCheck() {
					if ( !jQuery.isReady ) {

						try {
							// Use the trick by Diego Perini
							// http://javascript.nwbox.com/IEContentLoaded/
							top.doScroll("left");
						} catch(e) {
							return setTimeout( doScrollCheck, 50 );
						}

						// detach all dom ready events
						detach();

						// and execute any waiting functions
						jQuery.ready();
					}
				})();
			}
		}
	}
	return readyList.promise( obj );
};

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function isArraylike( obj ) {
	var length = obj.length,
		type = jQuery.type( obj );

	if ( jQuery.isWindow( obj ) ) {
		return false;
	}

	if ( obj.nodeType === 1 && length ) {
		return true;
	}

	return type === "array" || type !== "function" &&
		( length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj );
}

// All jQuery objects should point back to these
rootjQuery = jQuery(document);
// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.match( core_rnotwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Flag to know if list is currently firing
		firing,
		// Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ? jQuery.inArray( fn, list ) > -1 : !!( list && list.length );
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				args = args || [];
				args = [ context, args.slice ? args.slice() : args ];
				if ( list && ( !fired || stack ) ) {
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};
jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var action = tuple[ 0 ],
								fn = jQuery.isFunction( fns[ i ] ) && fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ](function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && jQuery.isFunction( returned.promise ) ) {
									returned.promise()
										.done( newDefer.resolve )
										.fail( newDefer.reject )
										.progress( newDefer.notify );
								} else {
									newDefer[ action + "With" ]( this === promise ? newDefer.promise() : this, fn ? [ returned ] : arguments );
								}
							});
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ]
			deferred[ tuple[0] ] = function() {
				deferred[ tuple[0] + "With" ]( this === deferred ? promise : this, arguments );
				return this;
			};
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = core_slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? core_slice.call( arguments ) : value;
					if( values === progressValues ) {
						deferred.notifyWith( contexts, values );
					} else if ( !( --remaining ) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// if we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});
jQuery.support = (function() {

	var support, all, a,
		input, select, fragment,
		opt, eventName, isSupported, i,
		div = document.createElement("div");

	// Setup
	div.setAttribute( "className", "t" );
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";

	// Support tests won't run in some limited or non-browser environments
	all = div.getElementsByTagName("*");
	a = div.getElementsByTagName("a")[ 0 ];
	if ( !all || !a || !all.length ) {
		return {};
	}

	// First batch of tests
	select = document.createElement("select");
	opt = select.appendChild( document.createElement("option") );
	input = div.getElementsByTagName("input")[ 0 ];

	a.style.cssText = "top:1px;float:left;opacity:.5";
	support = {
		// Test setAttribute on camelCase class. If it works, we need attrFixes when doing get/setAttribute (ie6/7)
		getSetAttribute: div.className !== "t",

		// IE strips leading whitespace when .innerHTML is used
		leadingWhitespace: div.firstChild.nodeType === 3,

		// Make sure that tbody elements aren't automatically inserted
		// IE will insert them into empty tables
		tbody: !div.getElementsByTagName("tbody").length,

		// Make sure that link elements get serialized correctly by innerHTML
		// This requires a wrapper element in IE
		htmlSerialize: !!div.getElementsByTagName("link").length,

		// Get the style information from getAttribute
		// (IE uses .cssText instead)
		style: /top/.test( a.getAttribute("style") ),

		// Make sure that URLs aren't manipulated
		// (IE normalizes it by default)
		hrefNormalized: a.getAttribute("href") === "/a",

		// Make sure that element opacity exists
		// (IE uses filter instead)
		// Use a regex to work around a WebKit issue. See #5145
		opacity: /^0.5/.test( a.style.opacity ),

		// Verify style float existence
		// (IE uses styleFloat instead of cssFloat)
		cssFloat: !!a.style.cssFloat,

		// Check the default checkbox/radio value ("" on WebKit; "on" elsewhere)
		checkOn: !!input.value,

		// Make sure that a selected-by-default option has a working selected property.
		// (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
		optSelected: opt.selected,

		// Tests for enctype support on a form (#6743)
		enctype: !!document.createElement("form").enctype,

		// Makes sure cloning an html5 element does not cause problems
		// Where outerHTML is undefined, this still works
		html5Clone: document.createElement("nav").cloneNode( true ).outerHTML !== "<:nav></:nav>",

		// jQuery.support.boxModel DEPRECATED in 1.8 since we don't support Quirks Mode
		boxModel: document.compatMode === "CSS1Compat",

		// Will be defined later
		deleteExpando: true,
		noCloneEvent: true,
		inlineBlockNeedsLayout: false,
		shrinkWrapBlocks: false,
		reliableMarginRight: true,
		boxSizingReliable: true,
		pixelPosition: false
	};

	// Make sure checked status is properly cloned
	input.checked = true;
	support.noCloneChecked = input.cloneNode( true ).checked;

	// Make sure that the options inside disabled selects aren't marked as disabled
	// (WebKit marks them as disabled)
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Support: IE<9
	try {
		delete div.test;
	} catch( e ) {
		support.deleteExpando = false;
	}

	// Check if we can trust getAttribute("value")
	input = document.createElement("input");
	input.setAttribute( "value", "" );
	support.input = input.getAttribute( "value" ) === "";

	// Check if an input maintains its value after becoming a radio
	input.value = "t";
	input.setAttribute( "type", "radio" );
	support.radioValue = input.value === "t";

	// #11217 - WebKit loses check when the name is after the checked attribute
	input.setAttribute( "checked", "t" );
	input.setAttribute( "name", "t" );

	fragment = document.createDocumentFragment();
	fragment.appendChild( input );

	// Check if a disconnected checkbox will retain its checked
	// value of true after appended to the DOM (IE6/7)
	support.appendChecked = input.checked;

	// WebKit doesn't clone checked state correctly in fragments
	support.checkClone = fragment.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE<9
	// Opera does not clone events (and typeof div.attachEvent === undefined).
	// IE9-10 clones events bound via attachEvent, but they don't trigger with .click()
	if ( div.attachEvent ) {
		div.attachEvent( "onclick", function() {
			support.noCloneEvent = false;
		});

		div.cloneNode( true ).click();
	}

	// Support: IE<9 (lack submit/change bubble), Firefox 17+ (lack focusin event)
	// Beware of CSP restrictions (https://developer.mozilla.org/en/Security/CSP), test/csp.php
	for ( i in { submit: true, change: true, focusin: true }) {
		div.setAttribute( eventName = "on" + i, "t" );

		support[ i + "Bubbles" ] = eventName in window || div.attributes[ eventName ].expando === false;
	}

	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	// Run tests that need a body at doc ready
	jQuery(function() {
		var container, marginDiv, tds,
			divReset = "padding:0;margin:0;border:0;display:block;box-sizing:content-box;-moz-box-sizing:content-box;-webkit-box-sizing:content-box;",
			body = document.getElementsByTagName("body")[0];

		if ( !body ) {
			// Return for frameset docs that don't have a body
			return;
		}

		container = document.createElement("div");
		container.style.cssText = "border:0;width:0;height:0;position:absolute;top:0;left:-9999px;margin-top:1px";

		body.appendChild( container ).appendChild( div );

		// Support: IE8
		// Check if table cells still have offsetWidth/Height when they are set
		// to display:none and there are still other visible table cells in a
		// table row; if so, offsetWidth/Height are not reliable for use when
		// determining if an element has been hidden directly using
		// display:none (it is still safe to use offsets if a parent element is
		// hidden; don safety goggles and see bug #4512 for more information).
		div.innerHTML = "<table><tr><td></td><td>t</td></tr></table>";
		tds = div.getElementsByTagName("td");
		tds[ 0 ].style.cssText = "padding:0;margin:0;border:0;display:none";
		isSupported = ( tds[ 0 ].offsetHeight === 0 );

		tds[ 0 ].style.display = "";
		tds[ 1 ].style.display = "none";

		// Support: IE8
		// Check if empty table cells still have offsetWidth/Height
		support.reliableHiddenOffsets = isSupported && ( tds[ 0 ].offsetHeight === 0 );

		// Check box-sizing and margin behavior
		div.innerHTML = "";
		div.style.cssText = "box-sizing:border-box;-moz-box-sizing:border-box;-webkit-box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%;";
		support.boxSizing = ( div.offsetWidth === 4 );
		support.doesNotIncludeMarginInBodyOffset = ( body.offsetTop !== 1 );

		// Use window.getComputedStyle because jsdom on node.js will break without it.
		if ( window.getComputedStyle ) {
			support.pixelPosition = ( window.getComputedStyle( div, null ) || {} ).top !== "1%";
			support.boxSizingReliable = ( window.getComputedStyle( div, null ) || { width: "4px" } ).width === "4px";

			// Check if div with explicit width and no margin-right incorrectly
			// gets computed margin-right based on width of container. (#3333)
			// Fails in WebKit before Feb 2011 nightlies
			// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
			marginDiv = div.appendChild( document.createElement("div") );
			marginDiv.style.cssText = div.style.cssText = divReset;
			marginDiv.style.marginRight = marginDiv.style.width = "0";
			div.style.width = "1px";

			support.reliableMarginRight =
				!parseFloat( ( window.getComputedStyle( marginDiv, null ) || {} ).marginRight );
		}

		if ( typeof div.style.zoom !== core_strundefined ) {
			// Support: IE<8
			// Check if natively block-level elements act like inline-block
			// elements when setting their display to 'inline' and giving
			// them layout
			div.innerHTML = "";
			div.style.cssText = divReset + "width:1px;padding:1px;display:inline;zoom:1";
			support.inlineBlockNeedsLayout = ( div.offsetWidth === 3 );

			// Support: IE6
			// Check if elements with layout shrink-wrap their children
			div.style.display = "block";
			div.innerHTML = "<div></div>";
			div.firstChild.style.width = "5px";
			support.shrinkWrapBlocks = ( div.offsetWidth !== 3 );

			if ( support.inlineBlockNeedsLayout ) {
				// Prevent IE 6 from affecting layout for positioned elements #11048
				// Prevent IE from shrinking the body in IE 7 mode #12869
				// Support: IE<8
				body.style.zoom = 1;
			}
		}

		body.removeChild( container );

		// Null elements to avoid leaks in IE
		container = div = tds = marginDiv = null;
	});

	// Null elements to avoid leaks in IE
	all = select = fragment = opt = a = input = null;

	return support;
})();

var rbrace = /(?:\{[\s\S]*\}|\[[\s\S]*\])$/,
	rmultiDash = /([A-Z])/g;

function internalData( elem, name, data, pvt /* Internal Use Only */ ){
	if ( !jQuery.acceptData( elem ) ) {
		return;
	}

	var thisCache, ret,
		internalKey = jQuery.expando,
		getByName = typeof name === "string",

		// We have to handle DOM nodes and JS objects differently because IE6-7
		// can't GC object references properly across the DOM-JS boundary
		isNode = elem.nodeType,

		// Only DOM nodes need the global jQuery cache; JS object data is
		// attached directly to the object so GC can occur automatically
		cache = isNode ? jQuery.cache : elem,

		// Only defining an ID for JS objects if its cache already exists allows
		// the code to shortcut on the same path as a DOM node with no cache
		id = isNode ? elem[ internalKey ] : elem[ internalKey ] && internalKey;

	// Avoid doing any more work than we need to when trying to get data on an
	// object that has no data at all
	if ( (!id || !cache[id] || (!pvt && !cache[id].data)) && getByName && data === undefined ) {
		return;
	}

	if ( !id ) {
		// Only DOM nodes need a new unique ID for each element since their data
		// ends up in the global cache
		if ( isNode ) {
			elem[ internalKey ] = id = core_deletedIds.pop() || jQuery.guid++;
		} else {
			id = internalKey;
		}
	}

	if ( !cache[ id ] ) {
		cache[ id ] = {};

		// Avoids exposing jQuery metadata on plain JS objects when the object
		// is serialized using JSON.stringify
		if ( !isNode ) {
			cache[ id ].toJSON = jQuery.noop;
		}
	}

	// An object can be passed to jQuery.data instead of a key/value pair; this gets
	// shallow copied over onto the existing cache
	if ( typeof name === "object" || typeof name === "function" ) {
		if ( pvt ) {
			cache[ id ] = jQuery.extend( cache[ id ], name );
		} else {
			cache[ id ].data = jQuery.extend( cache[ id ].data, name );
		}
	}

	thisCache = cache[ id ];

	// jQuery data() is stored in a separate object inside the object's internal data
	// cache in order to avoid key collisions between internal data and user-defined
	// data.
	if ( !pvt ) {
		if ( !thisCache.data ) {
			thisCache.data = {};
		}

		thisCache = thisCache.data;
	}

	if ( data !== undefined ) {
		thisCache[ jQuery.camelCase( name ) ] = data;
	}

	// Check for both converted-to-camel and non-converted data property names
	// If a data property was specified
	if ( getByName ) {

		// First Try to find as-is property data
		ret = thisCache[ name ];

		// Test for null|undefined property data
		if ( ret == null ) {

			// Try to find the camelCased property
			ret = thisCache[ jQuery.camelCase( name ) ];
		}
	} else {
		ret = thisCache;
	}

	return ret;
}

function internalRemoveData( elem, name, pvt ) {
	if ( !jQuery.acceptData( elem ) ) {
		return;
	}

	var i, l, thisCache,
		isNode = elem.nodeType,

		// See jQuery.data for more information
		cache = isNode ? jQuery.cache : elem,
		id = isNode ? elem[ jQuery.expando ] : jQuery.expando;

	// If there is already no cache entry for this object, there is no
	// purpose in continuing
	if ( !cache[ id ] ) {
		return;
	}

	if ( name ) {

		thisCache = pvt ? cache[ id ] : cache[ id ].data;

		if ( thisCache ) {

			// Support array or space separated string names for data keys
			if ( !jQuery.isArray( name ) ) {

				// try the string as a key before any manipulation
				if ( name in thisCache ) {
					name = [ name ];
				} else {

					// split the camel cased version by spaces unless a key with the spaces exists
					name = jQuery.camelCase( name );
					if ( name in thisCache ) {
						name = [ name ];
					} else {
						name = name.split(" ");
					}
				}
			} else {
				// If "name" is an array of keys...
				// When data is initially created, via ("key", "val") signature,
				// keys will be converted to camelCase.
				// Since there is no way to tell _how_ a key was added, remove
				// both plain key and camelCase key. #12786
				// This will only penalize the array argument path.
				name = name.concat( jQuery.map( name, jQuery.camelCase ) );
			}

			for ( i = 0, l = name.length; i < l; i++ ) {
				delete thisCache[ name[i] ];
			}

			// If there is no data left in the cache, we want to continue
			// and let the cache object itself get destroyed
			if ( !( pvt ? isEmptyDataObject : jQuery.isEmptyObject )( thisCache ) ) {
				return;
			}
		}
	}

	// See jQuery.data for more information
	if ( !pvt ) {
		delete cache[ id ].data;

		// Don't destroy the parent cache unless the internal data object
		// had been the only thing left in it
		if ( !isEmptyDataObject( cache[ id ] ) ) {
			return;
		}
	}

	// Destroy the cache
	if ( isNode ) {
		jQuery.cleanData( [ elem ], true );

	// Use delete when supported for expandos or `cache` is not a window per isWindow (#10080)
	} else if ( jQuery.support.deleteExpando || cache != cache.window ) {
		delete cache[ id ];

	// When all else fails, null
	} else {
		cache[ id ] = null;
	}
}

jQuery.extend({
	cache: {},

	// Unique for each copy of jQuery on the page
	// Non-digits removed to match rinlinejQuery
	expando: "jQuery" + ( core_version + Math.random() ).replace( /\D/g, "" ),

	// The following elements throw uncatchable exceptions if you
	// attempt to add expando properties to them.
	noData: {
		"embed": true,
		// Ban all objects except for Flash (which handle expandos)
		"object": "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",
		"applet": true
	},

	hasData: function( elem ) {
		elem = elem.nodeType ? jQuery.cache[ elem[jQuery.expando] ] : elem[ jQuery.expando ];
		return !!elem && !isEmptyDataObject( elem );
	},

	data: function( elem, name, data ) {
		return internalData( elem, name, data );
	},

	removeData: function( elem, name ) {
		return internalRemoveData( elem, name );
	},

	// For internal use only.
	_data: function( elem, name, data ) {
		return internalData( elem, name, data, true );
	},

	_removeData: function( elem, name ) {
		return internalRemoveData( elem, name, true );
	},

	// A method for determining if a DOM node can handle the data expando
	acceptData: function( elem ) {
		// Do not set data on non-element because it will not be cleared (#8335).
		if ( elem.nodeType && elem.nodeType !== 1 && elem.nodeType !== 9 ) {
			return false;
		}

		var noData = elem.nodeName && jQuery.noData[ elem.nodeName.toLowerCase() ];

		// nodes accept data unless otherwise specified; rejection can be conditional
		return !noData || noData !== true && elem.getAttribute("classid") === noData;
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var attrs, name,
			elem = this[0],
			i = 0,
			data = null;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = jQuery.data( elem );

				if ( elem.nodeType === 1 && !jQuery._data( elem, "parsedAttrs" ) ) {
					attrs = elem.attributes;
					for ( ; i < attrs.length; i++ ) {
						name = attrs[i].name;

						if ( !name.indexOf( "data-" ) ) {
							name = jQuery.camelCase( name.slice(5) );

							dataAttr( elem, name, data[ name ] );
						}
					}
					jQuery._data( elem, "parsedAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				jQuery.data( this, key );
			});
		}

		return jQuery.access( this, function( value ) {

			if ( value === undefined ) {
				// Try to fetch any internally stored data first
				return elem ? dataAttr( elem, key, jQuery.data( elem, key ) ) : null;
			}

			this.each(function() {
				jQuery.data( this, key, value );
			});
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each(function() {
			jQuery.removeData( this, key );
		});
	}
});

function dataAttr( elem, key, data ) {
	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {

		var name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();

		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
					data === "false" ? false :
					data === "null" ? null :
					// Only convert to a number if it doesn't change the string
					+data + "" === data ? +data :
					rbrace.test( data ) ? jQuery.parseJSON( data ) :
						data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			jQuery.data( elem, key, data );

		} else {
			data = undefined;
		}
	}

	return data;
}

// checks a cache object for emptiness
function isEmptyDataObject( obj ) {
	var name;
	for ( name in obj ) {

		// if the public data object is empty, the private is still empty
		if ( name === "data" && jQuery.isEmptyObject( obj[name] ) ) {
			continue;
		}
		if ( name !== "toJSON" ) {
			return false;
		}
	}

	return true;
}
jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = jQuery._data( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray(data) ) {
					queue = jQuery._data( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		hooks.cur = fn;
		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// not intended for public consumption - generates a queueHooks object, or returns the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return jQuery._data( elem, key ) || jQuery._data( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				jQuery._removeData( elem, type + "queue" );
				jQuery._removeData( elem, key );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	// Based off of the plugin by Clint Helfers, with permission.
	// http://blindsignals.com/index.php/2009/07/jquery-delay/
	delay: function( time, type ) {
		time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
		type = type || "fx";

		return this.queue( type, function( next, hooks ) {
			var timeout = setTimeout( next, time );
			hooks.stop = function() {
				clearTimeout( timeout );
			};
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while( i-- ) {
			tmp = jQuery._data( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var nodeHook, boolHook,
	rclass = /[\t\r\n]/g,
	rreturn = /\r/g,
	rfocusable = /^(?:input|select|textarea|button|object)$/i,
	rclickable = /^(?:a|area)$/i,
	rboolean = /^(?:checked|selected|autofocus|autoplay|async|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped)$/i,
	ruseDefault = /^(?:checked|selected)$/i,
	getSetAttribute = jQuery.support.getSetAttribute,
	getSetInput = jQuery.support.input;

jQuery.fn.extend({
	attr: function( name, value ) {
		return jQuery.access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	},

	prop: function( name, value ) {
		return jQuery.access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		name = jQuery.propFix[ name ] || name;
		return this.each(function() {
			// try/catch handles cases where IE balks (such as removing a property on window)
			try {
				this[ name ] = undefined;
				delete this[ name ];
			} catch( e ) {}
		});
	},

	addClass: function( value ) {
		var classes, elem, cur, clazz, j,
			i = 0,
			len = this.length,
			proceed = typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call( this, j, this.className ) );
			});
		}

		if ( proceed ) {
			// The disjunction here is for better compressibility (see removeClass)
			classes = ( value || "" ).match( core_rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					" "
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}
					elem.className = jQuery.trim( cur );

				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, clazz, j,
			i = 0,
			len = this.length,
			proceed = arguments.length === 0 || typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call( this, j, this.className ) );
			});
		}
		if ( proceed ) {
			classes = ( value || "" ).match( core_rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					""
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) >= 0 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}
					elem.className = value ? jQuery.trim( cur ) : "";
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value,
			isBool = typeof stateVal === "boolean";

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					state = stateVal,
					classNames = value.match( core_rnotwhite ) || [];

				while ( (className = classNames[ i++ ]) ) {
					// check each className given, space separated list
					state = isBool ? state : !self.hasClass( className );
					self[ state ? "addClass" : "removeClass" ]( className );
				}

			// Toggle whole class name
			} else if ( type === core_strundefined || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					jQuery._data( this, "__className__", this.className );
				}

				// If the element has a class name or if we're passed "false",
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				this.className = this.className || value === false ? "" : jQuery._data( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	},

	val: function( value ) {
		var ret, hooks, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// handle most common string cases
					ret.replace(rreturn, "") :
					// handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val,
				self = jQuery(this);

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, self.val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";
			} else if ( typeof val === "number" ) {
				val += "";
			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map(val, function ( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				// attributes.value is undefined in Blackberry 4.7 but
				// uses .value. See #6932
				var val = elem.attributes.value;
				return !val || val.specified ? elem.value : elem.text;
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// oldIE doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( jQuery.support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var values = jQuery.makeArray( value );

				jQuery(elem).find("option").each(function() {
					this.selected = jQuery.inArray( jQuery(this).val(), values ) >= 0;
				});

				if ( !values.length ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	},

	attr: function( elem, name, value ) {
		var hooks, notxml, ret,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === core_strundefined ) {
			return jQuery.prop( elem, name, value );
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( notxml ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] || ( rboolean.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );

			} else if ( hooks && notxml && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && notxml && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {

			// In IE9+, Flash objects don't have .getAttribute (#12945)
			// Support: IE9+
			if ( typeof elem.getAttribute !== core_strundefined ) {
				ret =  elem.getAttribute( name );
			}

			// Non-existent attributes return null, we normalize to undefined
			return ret == null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var name, propName,
			i = 0,
			attrNames = value && value.match( core_rnotwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( (name = attrNames[i++]) ) {
				propName = jQuery.propFix[ name ] || name;

				// Boolean attributes get special treatment (#10870)
				if ( rboolean.test( name ) ) {
					// Set corresponding property to false for boolean attributes
					// Also clear defaultChecked/defaultSelected (if appropriate) for IE<8
					if ( !getSetAttribute && ruseDefault.test( name ) ) {
						elem[ jQuery.camelCase( "default-" + name ) ] =
							elem[ propName ] = false;
					} else {
						elem[ propName ] = false;
					}

				// See #9699 for explanation of this approach (setting first, then removal)
				} else {
					jQuery.attr( elem, name, "" );
				}

				elem.removeAttribute( getSetAttribute ? name : propName );
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !jQuery.support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
					// Setting the type on a radio button after the value resets the value in IE6-9
					// Reset value to default in case type is set after value during creation
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	},

	propFix: {
		tabindex: "tabIndex",
		readonly: "readOnly",
		"for": "htmlFor",
		"class": "className",
		maxlength: "maxLength",
		cellspacing: "cellSpacing",
		cellpadding: "cellPadding",
		rowspan: "rowSpan",
		colspan: "colSpan",
		usemap: "useMap",
		frameborder: "frameBorder",
		contenteditable: "contentEditable"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				return ( elem[ name ] = value );
			}

		} else {
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
				return ret;

			} else {
				return elem[ name ];
			}
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				// elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
				// http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				var attributeNode = elem.getAttributeNode("tabindex");

				return attributeNode && attributeNode.specified ?
					parseInt( attributeNode.value, 10 ) :
					rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
						0 :
						undefined;
			}
		}
	}
});

// Hook for boolean attributes
boolHook = {
	get: function( elem, name ) {
		var
			// Use .prop to determine if this attribute is understood as boolean
			prop = jQuery.prop( elem, name ),

			// Fetch it accordingly
			attr = typeof prop === "boolean" && elem.getAttribute( name ),
			detail = typeof prop === "boolean" ?

				getSetInput && getSetAttribute ?
					attr != null :
					// oldIE fabricates an empty string for missing boolean attributes
					// and conflates checked/selected into attroperties
					ruseDefault.test( name ) ?
						elem[ jQuery.camelCase( "default-" + name ) ] :
						!!attr :

				// fetch an attribute node for properties not recognized as boolean
				elem.getAttributeNode( name );

		return detail && detail.value !== false ?
			name.toLowerCase() :
			undefined;
	},
	set: function( elem, value, name ) {
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else if ( getSetInput && getSetAttribute || !ruseDefault.test( name ) ) {
			// IE<8 needs the *property* name
			elem.setAttribute( !getSetAttribute && jQuery.propFix[ name ] || name, name );

		// Use defaultChecked and defaultSelected for oldIE
		} else {
			elem[ jQuery.camelCase( "default-" + name ) ] = elem[ name ] = true;
		}

		return name;
	}
};

// fix oldIE value attroperty
if ( !getSetInput || !getSetAttribute ) {
	jQuery.attrHooks.value = {
		get: function( elem, name ) {
			var ret = elem.getAttributeNode( name );
			return jQuery.nodeName( elem, "input" ) ?

				// Ignore the value *property* by using defaultValue
				elem.defaultValue :

				ret && ret.specified ? ret.value : undefined;
		},
		set: function( elem, value, name ) {
			if ( jQuery.nodeName( elem, "input" ) ) {
				// Does not return so that setAttribute is also used
				elem.defaultValue = value;
			} else {
				// Use nodeHook if defined (#1954); otherwise setAttribute is fine
				return nodeHook && nodeHook.set( elem, value, name );
			}
		}
	};
}

// IE6/7 do not support getting/setting some attributes with get/setAttribute
if ( !getSetAttribute ) {

	// Use this for any attribute in IE6/7
	// This fixes almost every IE6/7 issue
	nodeHook = jQuery.valHooks.button = {
		get: function( elem, name ) {
			var ret = elem.getAttributeNode( name );
			return ret && ( name === "id" || name === "name" || name === "coords" ? ret.value !== "" : ret.specified ) ?
				ret.value :
				undefined;
		},
		set: function( elem, value, name ) {
			// Set the existing or create a new attribute node
			var ret = elem.getAttributeNode( name );
			if ( !ret ) {
				elem.setAttributeNode(
					(ret = elem.ownerDocument.createAttribute( name ))
				);
			}

			ret.value = value += "";

			// Break association with cloned elements by also using setAttribute (#9646)
			return name === "value" || value === elem.getAttribute( name ) ?
				value :
				undefined;
		}
	};

	// Set contenteditable to false on removals(#10429)
	// Setting to empty string throws an error as an invalid value
	jQuery.attrHooks.contenteditable = {
		get: nodeHook.get,
		set: function( elem, value, name ) {
			nodeHook.set( elem, value === "" ? false : value, name );
		}
	};

	// Set width and height to auto instead of 0 on empty string( Bug #8150 )
	// This is for removals
	jQuery.each([ "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
			set: function( elem, value ) {
				if ( value === "" ) {
					elem.setAttribute( name, "auto" );
					return value;
				}
			}
		});
	});
}


// Some attributes require a special call on IE
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !jQuery.support.hrefNormalized ) {
	jQuery.each([ "href", "src", "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
			get: function( elem ) {
				var ret = elem.getAttribute( name, 2 );
				return ret == null ? undefined : ret;
			}
		});
	});

	// href/src property should get the full normalized URL (#10299/#12915)
	jQuery.each([ "href", "src" ], function( i, name ) {
		jQuery.propHooks[ name ] = {
			get: function( elem ) {
				return elem.getAttribute( name, 4 );
			}
		};
	});
}

if ( !jQuery.support.style ) {
	jQuery.attrHooks.style = {
		get: function( elem ) {
			// Return undefined in the case of empty string
			// Note: IE uppercases css property names, but if we were to .toLowerCase()
			// .cssText, that would destroy case senstitivity in URL's, like in "background"
			return elem.style.cssText || undefined;
		},
		set: function( elem, value ) {
			return ( elem.style.cssText = value + "" );
		}
	};
}

// Safari mis-reports the default selected property of an option
// Accessing the parent's selectedIndex property fixes it
if ( !jQuery.support.optSelected ) {
	jQuery.propHooks.selected = jQuery.extend( jQuery.propHooks.selected, {
		get: function( elem ) {
			var parent = elem.parentNode;

			if ( parent ) {
				parent.selectedIndex;

				// Make sure that it also works with optgroups, see #5701
				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
			return null;
		}
	});
}

// IE6/7 call enctype encoding
if ( !jQuery.support.enctype ) {
	jQuery.propFix.enctype = "encoding";
}

// Radios and checkboxes getter/setter
if ( !jQuery.support.checkOn ) {
	jQuery.each([ "radio", "checkbox" ], function() {
		jQuery.valHooks[ this ] = {
			get: function( elem ) {
				// Handle the case where in Webkit "" is returned instead of "on" if a value isn't specified
				return elem.getAttribute("value") === null ? "on" : elem.value;
			}
		};
	});
}
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = jQuery.extend( jQuery.valHooks[ this ], {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	});
});
var rformElems = /^(?:input|select|textarea)$/i,
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {
		var tmp, events, t, handleObjIn,
			special, eventHandle, handleObj,
			handlers, type, namespaces, origType,
			elemData = jQuery._data( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !(events = elemData.events) ) {
			events = elemData.events = {};
		}
		if ( !(eventHandle = elemData.handle) ) {
			eventHandle = elemData.handle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== core_strundefined && (!e || jQuery.event.triggered !== e.type) ?
					jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
					undefined;
			};
			// Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
			eventHandle.elem = elem;
		}

		// Handle multiple events separated by a space
		// jQuery(...).bind("mouseover mouseout", fn);
		types = ( types || "" ).match( core_rnotwhite ) || [""];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !(handlers = events[ type ]) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener/attachEvent if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					// Bind the global event handler to the element
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );

					} else if ( elem.attachEvent ) {
						elem.attachEvent( "on" + type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

		// Nullify elem to prevent memory leaks in IE
		elem = null;
	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {
		var j, handleObj, tmp,
			origCount, t, events,
			special, handlers, type,
			namespaces, origType,
			elemData = jQuery.hasData( elem ) && jQuery._data( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( core_rnotwhite ) || [""];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[2] && new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;

			// removeData also checks for emptiness and clears the expando if empty
			// so use it instead of delete
			jQuery._removeData( elem, "events" );
		}
	},

	trigger: function( event, data, elem, onlyHandlers ) {
		var handle, ontype, cur,
			bubbleType, special, tmp, i,
			eventPath = [ elem || document ],
			type = core_hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = core_hasOwn.call( event, "namespace" ) ? event.namespace.split(".") : [];

		cur = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf(".") >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf(":") < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		event.isTrigger = true;
		event.namespace = namespaces.join(".");
		event.namespace_re = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === (elem.ownerDocument || document) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( (cur = eventPath[i++]) && !event.isPropagationStopped() ) {

			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( jQuery._data( cur, "events" ) || {} )[ event.type ] && jQuery._data( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && jQuery.acceptData( cur ) && handle.apply && handle.apply( cur, data ) === false ) {
				event.preventDefault();
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( elem.ownerDocument, data ) === false) &&
				!(type === "click" && jQuery.nodeName( elem, "a" )) && jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Can't use an .isFunction() check here because IE6/7 fails that test.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && elem[ type ] && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					try {
						elem[ type ]();
					} catch ( e ) {
						// IE<9 dies on focus/blur to hidden element (#1486,#12518)
						// only reproducible on winXP IE8 native, not IE9 in IE8 mode
					}
					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event );

		var i, ret, handleObj, matched, j,
			handlerQueue = [],
			args = core_slice.call( arguments ),
			handlers = ( jQuery._data( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( (matched = handlerQueue[ i++ ]) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( (handleObj = matched.handlers[ j++ ]) && !event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or
				// 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.namespace_re || event.namespace_re.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( (event.result = ret) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var sel, handleObj, matches, i,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		// Black-hole SVG <use> instance trees (#13180)
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && cur.nodeType && (!event.button || event.type !== "click") ) {

			for ( ; cur != this; cur = cur.parentNode || this ) {

				// Don't check non-elements (#13208)
				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.nodeType === 1 && (cur.disabled !== true || event.type !== "click") ) {
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matches[ sel ] === undefined ) {
							matches[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matches[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, handlers: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( delegateCount < handlers.length ) {
			handlerQueue.push({ elem: this, handlers: handlers.slice( delegateCount ) });
		}

		return handlerQueue;
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop, copy,
			type = event.type,
			originalEvent = event,
			fixHook = this.fixHooks[ type ];

		if ( !fixHook ) {
			this.fixHooks[ type ] = fixHook =
				rmouseEvent.test( type ) ? this.mouseHooks :
				rkeyEvent.test( type ) ? this.keyHooks :
				{};
		}
		copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = new jQuery.Event( originalEvent );

		i = copy.length;
		while ( i-- ) {
			prop = copy[ i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Support: IE<9
		// Fix target property (#1925)
		if ( !event.target ) {
			event.target = originalEvent.srcElement || document;
		}

		// Support: Chrome 23+, Safari?
		// Target should not be a text node (#504, #13143)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		// Support: IE<9
		// For mouse/key events, metaKey==false if it's undefined (#3368, #11328)
		event.metaKey = !!event.metaKey;

		return fixHook.filter ? fixHook.filter( event, originalEvent ) : event;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var body, eventDoc, doc,
				button = original.button,
				fromElement = original.fromElement;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add relatedTarget, if necessary
			if ( !event.relatedTarget && fromElement ) {
				event.relatedTarget = fromElement === event.target ? original.toElement : fromElement;
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		click: {
			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( jQuery.nodeName( this, "input" ) && this.type === "checkbox" && this.click ) {
					this.click();
					return false;
				}
			}
		},
		focus: {
			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== document.activeElement && this.focus ) {
					try {
						this.focus();
						return false;
					} catch ( e ) {
						// Support: IE<9
						// If we error on focus to hidden element (#1486, #12518),
						// let .trigger() run the handlers
					}
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === document.activeElement && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Even when returnValue equals to undefined Firefox will still show alert
				if ( event.result !== undefined ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{ type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

jQuery.removeEvent = document.removeEventListener ?
	function( elem, type, handle ) {
		if ( elem.removeEventListener ) {
			elem.removeEventListener( type, handle, false );
		}
	} :
	function( elem, type, handle ) {
		var name = "on" + type;

		if ( elem.detachEvent ) {

			// #8545, #7054, preventing memory leaks for custom events in IE6-8
			// detachEvent needed property on element, by name of that event, to properly expose it to GC
			if ( typeof elem[ name ] === core_strundefined ) {
				elem[ name ] = null;
			}

			elem.detachEvent( name, handle );
		}
	};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = ( src.defaultPrevented || src.returnValue === false ||
			src.getPreventDefault && src.getPreventDefault() ) ? returnTrue : returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;
		if ( !e ) {
			return;
		}

		// If preventDefault exists, run it on the original event
		if ( e.preventDefault ) {
			e.preventDefault();

		// Support: IE
		// Otherwise set the returnValue property of the original event to false
		} else {
			e.returnValue = false;
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;
		if ( !e ) {
			return;
		}
		// If stopPropagation exists, run it on the original event
		if ( e.stopPropagation ) {
			e.stopPropagation();
		}

		// Support: IE
		// Set the cancelBubble property of the original event to true
		e.cancelBubble = true;
	},
	stopImmediatePropagation: function() {
		this.isImmediatePropagationStopped = returnTrue;
		this.stopPropagation();
	}
};

// Create mouseenter/leave events using mouseover/out and event-time checks
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// IE submit delegation
if ( !jQuery.support.submitBubbles ) {

	jQuery.event.special.submit = {
		setup: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Lazy-add a submit handler when a descendant form may potentially be submitted
			jQuery.event.add( this, "click._submit keypress._submit", function( e ) {
				// Node name check avoids a VML-related crash in IE (#9807)
				var elem = e.target,
					form = jQuery.nodeName( elem, "input" ) || jQuery.nodeName( elem, "button" ) ? elem.form : undefined;
				if ( form && !jQuery._data( form, "submitBubbles" ) ) {
					jQuery.event.add( form, "submit._submit", function( event ) {
						event._submit_bubble = true;
					});
					jQuery._data( form, "submitBubbles", true );
				}
			});
			// return undefined since we don't need an event listener
		},

		postDispatch: function( event ) {
			// If form was submitted by the user, bubble the event up the tree
			if ( event._submit_bubble ) {
				delete event._submit_bubble;
				if ( this.parentNode && !event.isTrigger ) {
					jQuery.event.simulate( "submit", this.parentNode, event, true );
				}
			}
		},

		teardown: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Remove delegated handlers; cleanData eventually reaps submit handlers attached above
			jQuery.event.remove( this, "._submit" );
		}
	};
}

// IE change delegation and checkbox/radio fix
if ( !jQuery.support.changeBubbles ) {

	jQuery.event.special.change = {

		setup: function() {

			if ( rformElems.test( this.nodeName ) ) {
				// IE doesn't fire change on a check/radio until blur; trigger it on click
				// after a propertychange. Eat the blur-change in special.change.handle.
				// This still fires onchange a second time for check/radio after blur.
				if ( this.type === "checkbox" || this.type === "radio" ) {
					jQuery.event.add( this, "propertychange._change", function( event ) {
						if ( event.originalEvent.propertyName === "checked" ) {
							this._just_changed = true;
						}
					});
					jQuery.event.add( this, "click._change", function( event ) {
						if ( this._just_changed && !event.isTrigger ) {
							this._just_changed = false;
						}
						// Allow triggered, simulated change events (#11500)
						jQuery.event.simulate( "change", this, event, true );
					});
				}
				return false;
			}
			// Delegated event; lazy-add a change handler on descendant inputs
			jQuery.event.add( this, "beforeactivate._change", function( e ) {
				var elem = e.target;

				if ( rformElems.test( elem.nodeName ) && !jQuery._data( elem, "changeBubbles" ) ) {
					jQuery.event.add( elem, "change._change", function( event ) {
						if ( this.parentNode && !event.isSimulated && !event.isTrigger ) {
							jQuery.event.simulate( "change", this.parentNode, event, true );
						}
					});
					jQuery._data( elem, "changeBubbles", true );
				}
			});
		},

		handle: function( event ) {
			var elem = event.target;

			// Swallow native change events from checkbox/radio, we already triggered them above
			if ( this !== elem || event.isSimulated || event.isTrigger || (elem.type !== "radio" && elem.type !== "checkbox") ) {
				return event.handleObj.handler.apply( this, arguments );
			}
		},

		teardown: function() {
			jQuery.event.remove( this, "._change" );

			return !rformElems.test( this.nodeName );
		}
	};
}

// Create "bubbling" focus and blur events
if ( !jQuery.support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler while someone wants focusin/focusout
		var attaches = 0,
			handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				if ( attaches++ === 0 ) {
					document.addEventListener( orig, handler, true );
				}
			},
			teardown: function() {
				if ( --attaches === 0 ) {
					document.removeEventListener( orig, handler, true );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var type, origFn;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) {
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		var elem = this[0];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
});
/*!
 * Sizzle CSS Selector Engine
 * Copyright 2012 jQuery Foundation and other contributors
 * Released under the MIT license
 * http://sizzlejs.com/
 */
(function( window, undefined ) {

var i,
	cachedruns,
	Expr,
	getText,
	isXML,
	compile,
	hasDuplicate,
	outermostContext,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsXML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,
	sortOrder,

	// Instance-specific data
	expando = "sizzle" + -(new Date()),
	preferredDoc = window.document,
	support = {},
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),

	// General-purpose constants
	strundefined = typeof undefined,
	MAX_NEGATIVE = 1 << 31,

	// Array methods
	arr = [],
	pop = arr.pop,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf if we can't use a native one
	indexOf = arr.indexOf || function( elem ) {
		var i = 0,
			len = this.length;
		for ( ; i < len; i++ ) {
			if ( this[i] === elem ) {
				return i;
			}
		}
		return -1;
	},


	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Acceptable operators http://www.w3.org/TR/selectors/#attribute-selectors
	operators = "([*^$|!~]?=)",
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")" + whitespace +
		"*(?:" + operators + whitespace + "*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" + identifier + ")|)|)" + whitespace + "*\\]",

	// Prefer arguments quoted,
	//   then not containing pseudos/brackets,
	//   then attribute selectors/non-parenthetical expressions,
	//   then anything else
	// These preferences are here to reduce the number of selectors
	//   needing tokenize in the PSEUDO preFilter
	pseudos = ":(" + characterEncoding + ")(?:\\(((['\"])((?:\\\\.|[^\\\\])*?)\\3|((?:\\\\.|[^\\\\()[\\]]|" + attributes.replace( 3, 8 ) + ")*)|.*)\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([\\x20\\t\\r\\n\\f>+~])" + whitespace + "*" ),
	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"NAME": new RegExp( "^\\[name=['\"]?(" + characterEncoding + ")['\"]?\\]" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rsibling = /[\x20\t\r\n\f]*[+~]/,

	rnative = /^[^{]+\{\s*\[native code/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rescape = /'|\\/g,
	rattributeQuotes = /\=[\x20\t\r\n\f]*([^'"\]]*)[\x20\t\r\n\f]*\]/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = /\\([\da-fA-F]{1,6}[\x20\t\r\n\f]?|.)/g,
	funescape = function( _, escaped ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		return high !== high ?
			escaped :
			// BMP codepoint
			high < 0 ?
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	};

// Use a stripped-down slice if we can't use a native one
try {
	slice.call( preferredDoc.documentElement.childNodes, 0 )[0].nodeType;
} catch ( e ) {
	slice = function( i ) {
		var elem,
			results = [];
		while ( (elem = this[i++]) ) {
			results.push( elem );
		}
		return results;
	};
}

/**
 * For feature detection
 * @param {Function} fn The function to test for native support
 */
function isNative( fn ) {
	return rnative.test( fn + "" );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var cache,
		keys = [];

	return (cache = function( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key += " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key ] = value);
	});
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return fn( div );
	} catch (e) {
		return false;
	} finally {
		// release memory in IE
		div = null;
	}
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];

	if ( !selector || typeof selector !== "string" ) {
		return results;
	}

	if ( (nodeType = context.nodeType) !== 1 && nodeType !== 9 ) {
		return [];
	}

	if ( !documentIsXML && !seed ) {

		// Shortcuts
		if ( (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, slice.call(context.getElementsByTagName( selector ), 0) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getByClassName && context.getElementsByClassName ) {
				push.apply( results, slice.call(context.getElementsByClassName( m ), 0) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && !rbuggyQSA.test(selector) ) {
			old = true;
			nid = expando;
			newContext = context;
			newSelector = nodeType === 9 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && context.parentNode || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results, slice.call( newContext.querySelectorAll(
						newSelector
					), 0 ) );
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Detect xml
 * @param {Element|Object} elem An element or a document
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var doc = node ? node.ownerDocument || node : preferredDoc;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;

	// Support tests
	documentIsXML = isXML( doc );

	// Check if getElementsByTagName("*") returns only elements
	support.tagNameNoComments = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Check if attributes should be retrieved by attribute nodes
	support.attributes = assert(function( div ) {
		div.innerHTML = "<select></select>";
		var type = typeof div.lastChild.getAttribute("multiple");
		// IE8 returns a string for some attributes even when not present
		return type !== "boolean" && type !== "string";
	});

	// Check if getElementsByClassName can be trusted
	support.getByClassName = assert(function( div ) {
		// Opera can't find a second classname (in 9.6)
		div.innerHTML = "<div class='hidden e'></div><div class='hidden'></div>";
		if ( !div.getElementsByClassName || !div.getElementsByClassName("e").length ) {
			return false;
		}

		// Safari 3.2 caches class attributes and doesn't catch changes
		div.lastChild.className = "e";
		return div.getElementsByClassName("e").length === 2;
	});

	// Check if getElementById returns elements by name
	// Check if getElementsByName privileges form controls or returns elements by ID
	support.getByName = assert(function( div ) {
		// Inject content
		div.id = expando + 0;
		div.innerHTML = "<a name='" + expando + "'></a><div name='" + expando + "'></div>";
		docElem.insertBefore( div, docElem.firstChild );

		// Test
		var pass = doc.getElementsByName &&
			// buggy browsers will return fewer than the correct 2
			doc.getElementsByName( expando ).length === 2 +
			// buggy browsers will return more than the correct 0
			doc.getElementsByName( expando + 0 ).length;
		support.getIdNotName = !doc.getElementById( expando );

		// Cleanup
		docElem.removeChild( div );

		return pass;
	});

	// IE6/7 return modified attributes
	Expr.attrHandle = assert(function( div ) {
		div.innerHTML = "<a href='#'></a>";
		return div.firstChild && typeof div.firstChild.getAttribute !== strundefined &&
			div.firstChild.getAttribute("href") === "#";
	}) ?
		{} :
		{
			"href": function( elem ) {
				return elem.getAttribute( "href", 2 );
			},
			"type": function( elem ) {
				return elem.getAttribute("type");
			}
		};

	// ID find and filter
	if ( support.getIdNotName ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== strundefined && !documentIsXML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [m] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== strundefined && !documentIsXML ) {
				var m = context.getElementById( id );

				return m ?
					m.id === id || typeof m.getAttributeNode !== strundefined && m.getAttributeNode("id").value === id ?
						[m] :
						undefined :
					[];
			}
		};
		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== strundefined && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.tagNameNoComments ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== strundefined ) {
				return context.getElementsByTagName( tag );
			}
		} :
		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Name
	Expr.find["NAME"] = support.getByName && function( tag, context ) {
		if ( typeof context.getElementsByName !== strundefined ) {
			return context.getElementsByName( name );
		}
	};

	// Class
	Expr.find["CLASS"] = support.getByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== strundefined && !documentIsXML ) {
			return context.getElementsByClassName( className );
		}
	};

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21),
	// no need to also add to buggyMatches since matches checks buggyQSA
	// A support test would require too much code (would include document ready)
	rbuggyQSA = [ ":focus" ];

	if ( (support.qsa = isNative(doc.querySelectorAll)) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explictly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			div.innerHTML = "<select><option selected=''></option></select>";

			// IE8 - Some boolean attributes are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:checked|disabled|ismap|multiple|readonly|selected|value)" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}
		});

		assert(function( div ) {

			// Opera 10-12/IE8 - ^= $= *= and empty values
			// Should not select anything
			div.innerHTML = "<input type='hidden' i=''/>";
			if ( div.querySelectorAll("[i^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:\"\"|'')" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = isNative( (matches = docElem.matchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.webkitMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = new RegExp( rbuggyMatches.join("|") );

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = isNative(docElem.contains) || docElem.compareDocumentPosition ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	// Document order sorting
	sortOrder = docElem.compareDocumentPosition ?
	function( a, b ) {
		var compare;

		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		if ( (compare = b.compareDocumentPosition && a.compareDocumentPosition && a.compareDocumentPosition( b )) ) {
			if ( compare & 1 || a.parentNode && a.parentNode.nodeType === 11 ) {
				if ( a === doc || contains( preferredDoc, a ) ) {
					return -1;
				}
				if ( b === doc || contains( preferredDoc, b ) ) {
					return 1;
				}
				return 0;
			}
			return compare & 4 ? -1 : 1;
		}

		return a.compareDocumentPosition ? -1 : 1;
	} :
	function( a, b ) {
		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;

		// Parentless nodes are either documents or disconnected
		} else if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	// Always assume the presence of duplicates if sort doesn't
	// pass them to our comparison function (as in Google Chrome).
	hasDuplicate = false;
	[0, 0].sort( sortOrder );
	support.detectDuplicates = hasDuplicate;

	return document;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	// rbuggyQSA always contains :focus, so no need for an existence check
	if ( support.matchesSelector && !documentIsXML && (!rbuggyMatches || !rbuggyMatches.test(expr)) && !rbuggyQSA.test(expr) ) {
		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch(e) {}
	}

	return Sizzle( expr, document, null, [elem] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	var val;

	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	if ( !documentIsXML ) {
		name = name.toLowerCase();
	}
	if ( (val = Expr.attrHandle[ name ]) ) {
		return val( elem );
	}
	if ( documentIsXML || support.attributes ) {
		return elem.getAttribute( name );
	}
	return ( (val = elem.getAttributeNode( name )) || elem.getAttribute( name ) ) && elem[ name ] === true ?
		name :
		val && val.specified ? val.value : null;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

// Document sorting and removing duplicates
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		i = 1,
		j = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		for ( ; (elem = results[i]); i++ ) {
			if ( elem === results[ i - 1 ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	return results;
};

function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && ( ~b.sourceIndex || MAX_NEGATIVE ) - ( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

// Returns a function to use in pseudos for input types
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

// Returns a function to use in pseudos for buttons
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

// Returns a function to use in pseudos for positionals
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		for ( ; (node = elem[i]); i++ ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (see #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[5] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[4] ) {
				match[2] = match[4];

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeName ) {
			if ( nodeName === "*" ) {
				return function() { return true; };
			}

			nodeName = nodeName.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
			};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( elem.className || (typeof elem.getAttribute !== strundefined && elem.getAttribute("class")) || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf.call( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifider
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsXML ?
						elem.getAttribute("xml:lang") || elem.getAttribute("lang") :
						elem.lang) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is only affected by element nodes and content nodes(including text(3), cdata(4)),
			//   not comment, processing instructions, or others
			// Thanks to Diego Perini for the nodeName shortcut
			//   Greater than "@" means alpha characters (specifically not starting with "#" or "?")
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeName > "@" || elem.nodeType === 3 || elem.nodeType === 4 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			// IE6 and 7 will map elem.type to 'text' for new HTML5 types (search, etc)
			// use getAttribute instead to test this case
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === elem.type );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

function tokenize( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( tokens = [] );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push( {
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			} );
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push( {
					value: matched,
					type: type,
					matches: match
				} );
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
}

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var data, cache, outerCache,
				dirkey = dirruns + " " + doneName;

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (cache = outerCache[ dir ]) && cache[0] === dirkey ) {
							if ( (data = cache[1]) === true || data === cachedruns ) {
								return data === true;
							}
						} else {
							cache = outerCache[ dir ] = [ dirkey ];
							cache[1] = matcher( elem, context, xml ) || cachedruns;
							if ( cache[1] === true ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf.call( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf.call( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			return ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector( tokens.slice( 0, i - 1 ) ).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	// A counter to specify which element is currently being matched
	var matcherCachedRuns = 0,
		bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, expandContext ) {
			var elem, j, matcher,
				setMatched = [],
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				outermost = expandContext != null,
				contextBackup = outermostContext,
				// We must always have either seed elements or context
				elems = seed || byElement && Expr.find["TAG"]( "*", expandContext && context.parentNode || context ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1);

			if ( outermost ) {
				outermostContext = context !== document && context;
				cachedruns = matcherCachedRuns;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			for ( ; (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
						cachedruns = ++matcherCachedRuns;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, group /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !group ) {
			group = tokenize( selector );
		}
		i = group.length;
		while ( i-- ) {
			cached = matcherFromTokens( group[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );
	}
	return cached;
};

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function select( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		match = tokenize( selector );

	if ( !seed ) {
		// Try to minimize operations if there is only one group
		if ( match.length === 1 ) {

			// Take a shortcut and set the context if the root selector is an ID
			tokens = match[0] = match[0].slice( 0 );
			if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
					context.nodeType === 9 && !documentIsXML &&
					Expr.relative[ tokens[1].type ] ) {

				context = Expr.find["ID"]( token.matches[0].replace( runescape, funescape ), context )[0];
				if ( !context ) {
					return results;
				}

				selector = selector.slice( tokens.shift().value.length );
			}

			// Fetch a seed set for right-to-left matching
			i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
			while ( i-- ) {
				token = tokens[i];

				// Abort if we hit a combinator
				if ( Expr.relative[ (type = token.type) ] ) {
					break;
				}
				if ( (find = Expr.find[ type ]) ) {
					// Search, expanding context for leading sibling combinators
					if ( (seed = find(
						token.matches[0].replace( runescape, funescape ),
						rsibling.test( tokens[0].type ) && context.parentNode || context
					)) ) {

						// If seed is empty or no tokens remain, we can return early
						tokens.splice( i, 1 );
						selector = seed.length && toSelector( tokens );
						if ( !selector ) {
							push.apply( results, slice.call( seed, 0 ) );
							return results;
						}

						break;
					}
				}
			}
		}
	}

	// Compile and execute a filtering function
	// Provide `match` to avoid retokenization if we modified the selector above
	compile( selector, match )(
		seed,
		context,
		documentIsXML,
		results,
		rsibling.test( selector )
	);
	return results;
}

// Deprecated
Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Easy API for creating new setFilters
function setFilters() {}
Expr.filters = setFilters.prototype = Expr.pseudos;
Expr.setFilters = new setFilters();

// Initialize with the default document
setDocument();

// Override sizzle attribute retrieval
Sizzle.attr = jQuery.attr;
jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;


})( window );
var runtil = /Until$/,
	rparentsprev = /^(?:parents|prev(?:Until|All))/,
	isSimple = /^.[^:#\[\.,]*$/,
	rneedsContext = jQuery.expr.match.needsContext,
	// methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.fn.extend({
	find: function( selector ) {
		var i, ret, self,
			len = this.length;

		if ( typeof selector !== "string" ) {
			self = this;
			return this.pushStack( jQuery( selector ).filter(function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			}) );
		}

		ret = [];
		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, this[ i ], ret );
		}

		// Needed because $( selector, context ) becomes $( context ).find( selector )
		ret = this.pushStack( len > 1 ? jQuery.unique( ret ) : ret );
		ret.selector = ( this.selector ? this.selector + " " : "" ) + selector;
		return ret;
	},

	has: function( target ) {
		var i,
			targets = jQuery( target, this ),
			len = targets.length;

		return this.filter(function() {
			for ( i = 0; i < len; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	not: function( selector ) {
		return this.pushStack( winnow(this, selector, false) );
	},

	filter: function( selector ) {
		return this.pushStack( winnow(this, selector, true) );
	},

	is: function( selector ) {
		return !!selector && (
			typeof selector === "string" ?
				// If this is a positional/relative selector, check membership in the returned set
				// so $("p:first").is("p:last") won't return true for a doc with two "p".
				rneedsContext.test( selector ) ?
					jQuery( selector, this.context ).index( this[0] ) >= 0 :
					jQuery.filter( selector, this ).length > 0 :
				this.filter( selector ).length > 0 );
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			ret = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			cur = this[i];

			while ( cur && cur.ownerDocument && cur !== context && cur.nodeType !== 11 ) {
				if ( pos ? pos.index(cur) > -1 : jQuery.find.matchesSelector(cur, selectors) ) {
					ret.push( cur );
					break;
				}
				cur = cur.parentNode;
			}
		}

		return this.pushStack( ret.length > 1 ? jQuery.unique( ret ) : ret );
	},

	// Determine the position of an element within
	// the matched set of elements
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[0] && this[0].parentNode ) ? this.first().prevAll().length : -1;
		}

		// index in selector
		if ( typeof elem === "string" ) {
			return jQuery.inArray( this[0], jQuery( elem ) );
		}

		// Locate the position of the desired element
		return jQuery.inArray(
			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[0] : elem, this );
	},

	add: function( selector, context ) {
		var set = typeof selector === "string" ?
				jQuery( selector, context ) :
				jQuery.makeArray( selector && selector.nodeType ? [ selector ] : selector ),
			all = jQuery.merge( this.get(), set );

		return this.pushStack( jQuery.unique(all) );
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

jQuery.fn.andSelf = jQuery.fn.addBack;

function sibling( cur, dir ) {
	do {
		cur = cur[ dir ];
	} while ( cur && cur.nodeType !== 1 );

	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return jQuery.nodeName( elem, "iframe" ) ?
			elem.contentDocument || elem.contentWindow.document :
			jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var ret = jQuery.map( this, fn, until );

		if ( !runtil.test( name ) ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			ret = jQuery.filter( selector, ret );
		}

		ret = this.length > 1 && !guaranteedUnique[ name ] ? jQuery.unique( ret ) : ret;

		if ( this.length > 1 && rparentsprev.test( name ) ) {
			ret = ret.reverse();
		}

		return this.pushStack( ret );
	};
});

jQuery.extend({
	filter: function( expr, elems, not ) {
		if ( not ) {
			expr = ":not(" + expr + ")";
		}

		return elems.length === 1 ?
			jQuery.find.matchesSelector(elems[0], expr) ? [ elems[0] ] : [] :
			jQuery.find.matches(expr, elems);
	},

	dir: function( elem, dir, until ) {
		var matched = [],
			cur = elem[ dir ];

		while ( cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery( cur ).is( until )) ) {
			if ( cur.nodeType === 1 ) {
				matched.push( cur );
			}
			cur = cur[dir];
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var r = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				r.push( n );
			}
		}

		return r;
	}
});

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, keep ) {

	// Can't pass null or undefined to indexOf in Firefox 4
	// Set to 0 to skip string check
	qualifier = qualifier || 0;

	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep(elements, function( elem, i ) {
			var retVal = !!qualifier.call( elem, i, elem );
			return retVal === keep;
		});

	} else if ( qualifier.nodeType ) {
		return jQuery.grep(elements, function( elem ) {
			return ( elem === qualifier ) === keep;
		});

	} else if ( typeof qualifier === "string" ) {
		var filtered = jQuery.grep(elements, function( elem ) {
			return elem.nodeType === 1;
		});

		if ( isSimple.test( qualifier ) ) {
			return jQuery.filter(qualifier, filtered, !keep);
		} else {
			qualifier = jQuery.filter( qualifier, filtered );
		}
	}

	return jQuery.grep(elements, function( elem ) {
		return ( jQuery.inArray( elem, qualifier ) >= 0 ) === keep;
	});
}
function createSafeFragment( document ) {
	var list = nodeNames.split( "|" ),
		safeFrag = document.createDocumentFragment();

	if ( safeFrag.createElement ) {
		while ( list.length ) {
			safeFrag.createElement(
				list.pop()
			);
		}
	}
	return safeFrag;
}

var nodeNames = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|" +
		"header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
	rinlinejQuery = / jQuery\d+="(?:null|\d+)"/g,
	rnoshimcache = new RegExp("<(?:" + nodeNames + ")[\\s/>]", "i"),
	rleadingWhitespace = /^\s+/,
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rtbody = /<tbody/i,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	manipulation_rcheckableType = /^(?:checkbox|radio)$/i,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /^$|\/(?:java|ecma)script/i,
	rscriptTypeMasked = /^true\/(.*)/,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,

	// We have to close these tags to support XHTML (#13200)
	wrapMap = {
		option: [ 1, "<select multiple='multiple'>", "</select>" ],
		legend: [ 1, "<fieldset>", "</fieldset>" ],
		area: [ 1, "<map>", "</map>" ],
		param: [ 1, "<object>", "</object>" ],
		thead: [ 1, "<table>", "</table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

		// IE6-8 can't serialize link, script, style, or any html5 (NoScope) tags,
		// unless wrapped in a div with non-breaking characters in front of it.
		_default: jQuery.support.htmlSerialize ? [ 0, "", "" ] : [ 1, "X<div>", "</div>"  ]
	},
	safeFragment = createSafeFragment( document ),
	fragmentDiv = safeFragment.appendChild( document.createElement("div") );

wrapMap.optgroup = wrapMap.option;
wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

jQuery.fn.extend({
	text: function( value ) {
		return jQuery.access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().append( ( this[0] && this[0].ownerDocument || document ).createTextNode( value ) );
		}, null, value, arguments.length );
	},

	wrapAll: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapAll( html.call(this, i) );
			});
		}

		if ( this[0] ) {
			// The elements to wrap the target around
			var wrap = jQuery( html, this[0].ownerDocument ).eq(0).clone(true);

			if ( this[0].parentNode ) {
				wrap.insertBefore( this[0] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstChild && elem.firstChild.nodeType === 1 ) {
					elem = elem.firstChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function(i) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	},

	append: function() {
		return this.domManip(arguments, true, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				this.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip(arguments, true, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				this.insertBefore( elem, this.firstChild );
			}
		});
	},

	before: function() {
		return this.domManip( arguments, false, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		});
	},

	after: function() {
		return this.domManip( arguments, false, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		});
	},

	// keepData is for internal use only--do not document
	remove: function( selector, keepData ) {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			if ( !selector || jQuery.filter( selector, [ elem ] ).length > 0 ) {
				if ( !keepData && elem.nodeType === 1 ) {
					jQuery.cleanData( getAll( elem ) );
				}

				if ( elem.parentNode ) {
					if ( keepData && jQuery.contains( elem.ownerDocument, elem ) ) {
						setGlobalEval( getAll( elem, "script" ) );
					}
					elem.parentNode.removeChild( elem );
				}
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			// Remove element nodes and prevent memory leaks
			if ( elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem, false ) );
			}

			// Remove any remaining nodes
			while ( elem.firstChild ) {
				elem.removeChild( elem.firstChild );
			}

			// If this is a select, ensure that it displays empty (#12336)
			// Support: IE<9
			if ( elem.options && jQuery.nodeName( elem, "select" ) ) {
				elem.options.length = 0;
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function () {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return jQuery.access( this, function( value ) {
			var elem = this[0] || {},
				i = 0,
				l = this.length;

			if ( value === undefined ) {
				return elem.nodeType === 1 ?
					elem.innerHTML.replace( rinlinejQuery, "" ) :
					undefined;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				( jQuery.support.htmlSerialize || !rnoshimcache.test( value )  ) &&
				( jQuery.support.leadingWhitespace || !rleadingWhitespace.test( value ) ) &&
				!wrapMap[ ( rtagName.exec( value ) || ["", ""] )[1].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for (; i < l; i++ ) {
						// Remove element nodes and prevent memory leaks
						elem = this[i] || {};
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch(e) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function( value ) {
		var isFunc = jQuery.isFunction( value );

		// Make sure that the elements are removed from the DOM before they are inserted
		// this can help fix replacing a parent with child elements
		if ( !isFunc && typeof value !== "string" ) {
			value = jQuery( value ).not( this ).detach();
		}

		return this.domManip( [ value ], true, function( elem ) {
			var next = this.nextSibling,
				parent = this.parentNode;

			if ( parent ) {
				jQuery( this ).remove();
				parent.insertBefore( elem, next );
			}
		});
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, table, callback ) {

		// Flatten any nested arrays
		args = core_concat.apply( [], args );

		var first, node, hasScripts,
			scripts, doc, fragment,
			i = 0,
			l = this.length,
			set = this,
			iNoClone = l - 1,
			value = args[0],
			isFunction = jQuery.isFunction( value );

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( isFunction || !( l <= 1 || typeof value !== "string" || jQuery.support.checkClone || !rchecked.test( value ) ) ) {
			return this.each(function( index ) {
				var self = set.eq( index );
				if ( isFunction ) {
					args[0] = value.call( this, index, table ? self.html() : undefined );
				}
				self.domManip( args, table, callback );
			});
		}

		if ( l ) {
			fragment = jQuery.buildFragment( args, this[ 0 ].ownerDocument, false, this );
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				table = table && jQuery.nodeName( first, "tr" );
				scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
				hasScripts = scripts.length;

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				for ( ; i < l; i++ ) {
					node = fragment;

					if ( i !== iNoClone ) {
						node = jQuery.clone( node, true, true );

						// Keep references to cloned scripts for later restoration
						if ( hasScripts ) {
							jQuery.merge( scripts, getAll( node, "script" ) );
						}
					}

					callback.call(
						table && jQuery.nodeName( this[i], "table" ) ?
							findOrAppend( this[i], "tbody" ) :
							this[i],
						node,
						i
					);
				}

				if ( hasScripts ) {
					doc = scripts[ scripts.length - 1 ].ownerDocument;

					// Reenable scripts
					jQuery.map( scripts, restoreScript );

					// Evaluate executable scripts on first document insertion
					for ( i = 0; i < hasScripts; i++ ) {
						node = scripts[ i ];
						if ( rscriptType.test( node.type || "" ) &&
							!jQuery._data( node, "globalEval" ) && jQuery.contains( doc, node ) ) {

							if ( node.src ) {
								// Hope ajax is available...
								jQuery.ajax({
									url: node.src,
									type: "GET",
									dataType: "script",
									async: false,
									global: false,
									"throws": true
								});
							} else {
								jQuery.globalEval( ( node.text || node.textContent || node.innerHTML || "" ).replace( rcleanScript, "" ) );
							}
						}
					}
				}

				// Fix #11809: Avoid leaking memory
				fragment = first = null;
			}
		}

		return this;
	}
});

function findOrAppend( elem, tag ) {
	return elem.getElementsByTagName( tag )[0] || elem.appendChild( elem.ownerDocument.createElement( tag ) );
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	var attr = elem.getAttributeNode("type");
	elem.type = ( attr && attr.specified ) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	var match = rscriptTypeMasked.exec( elem.type );
	if ( match ) {
		elem.type = match[1];
	} else {
		elem.removeAttribute("type");
	}
	return elem;
}

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var elem,
		i = 0;
	for ( ; (elem = elems[i]) != null; i++ ) {
		jQuery._data( elem, "globalEval", !refElements || jQuery._data( refElements[i], "globalEval" ) );
	}
}

function cloneCopyEvent( src, dest ) {

	if ( dest.nodeType !== 1 || !jQuery.hasData( src ) ) {
		return;
	}

	var type, i, l,
		oldData = jQuery._data( src ),
		curData = jQuery._data( dest, oldData ),
		events = oldData.events;

	if ( events ) {
		delete curData.handle;
		curData.events = {};

		for ( type in events ) {
			for ( i = 0, l = events[ type ].length; i < l; i++ ) {
				jQuery.event.add( dest, type, events[ type ][ i ] );
			}
		}
	}

	// make the cloned public data object a copy from the original
	if ( curData.data ) {
		curData.data = jQuery.extend( {}, curData.data );
	}
}

function fixCloneNodeIssues( src, dest ) {
	var nodeName, e, data;

	// We do not need to do anything for non-Elements
	if ( dest.nodeType !== 1 ) {
		return;
	}

	nodeName = dest.nodeName.toLowerCase();

	// IE6-8 copies events bound via attachEvent when using cloneNode.
	if ( !jQuery.support.noCloneEvent && dest[ jQuery.expando ] ) {
		data = jQuery._data( dest );

		for ( e in data.events ) {
			jQuery.removeEvent( dest, e, data.handle );
		}

		// Event data gets referenced instead of copied if the expando gets copied too
		dest.removeAttribute( jQuery.expando );
	}

	// IE blanks contents when cloning scripts, and tries to evaluate newly-set text
	if ( nodeName === "script" && dest.text !== src.text ) {
		disableScript( dest ).text = src.text;
		restoreScript( dest );

	// IE6-10 improperly clones children of object elements using classid.
	// IE10 throws NoModificationAllowedError if parent is null, #12132.
	} else if ( nodeName === "object" ) {
		if ( dest.parentNode ) {
			dest.outerHTML = src.outerHTML;
		}

		// This path appears unavoidable for IE9. When cloning an object
		// element in IE9, the outerHTML strategy above is not sufficient.
		// If the src has innerHTML and the destination does not,
		// copy the src.innerHTML into the dest.innerHTML. #10324
		if ( jQuery.support.html5Clone && ( src.innerHTML && !jQuery.trim(dest.innerHTML) ) ) {
			dest.innerHTML = src.innerHTML;
		}

	} else if ( nodeName === "input" && manipulation_rcheckableType.test( src.type ) ) {
		// IE6-8 fails to persist the checked state of a cloned checkbox
		// or radio button. Worse, IE6-7 fail to give the cloned element
		// a checked appearance if the defaultChecked value isn't also set

		dest.defaultChecked = dest.checked = src.checked;

		// IE6-7 get confused and end up setting the value of a cloned
		// checkbox/radio button to an empty string instead of "on"
		if ( dest.value !== src.value ) {
			dest.value = src.value;
		}

	// IE6-8 fails to return the selected option to the default selected
	// state when cloning options
	} else if ( nodeName === "option" ) {
		dest.defaultSelected = dest.selected = src.defaultSelected;

	// IE6-8 fails to set the defaultValue to the correct value when
	// cloning other types of input fields
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			i = 0,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone(true);
			jQuery( insert[i] )[ original ]( elems );

			// Modern browsers can apply jQuery collections as arrays, but oldIE needs a .get()
			core_push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
});

function getAll( context, tag ) {
	var elems, elem,
		i = 0,
		found = typeof context.getElementsByTagName !== core_strundefined ? context.getElementsByTagName( tag || "*" ) :
			typeof context.querySelectorAll !== core_strundefined ? context.querySelectorAll( tag || "*" ) :
			undefined;

	if ( !found ) {
		for ( found = [], elems = context.childNodes || context; (elem = elems[i]) != null; i++ ) {
			if ( !tag || jQuery.nodeName( elem, tag ) ) {
				found.push( elem );
			} else {
				jQuery.merge( found, getAll( elem, tag ) );
			}
		}
	}

	return tag === undefined || tag && jQuery.nodeName( context, tag ) ?
		jQuery.merge( [ context ], found ) :
		found;
}

// Used in buildFragment, fixes the defaultChecked property
function fixDefaultChecked( elem ) {
	if ( manipulation_rcheckableType.test( elem.type ) ) {
		elem.defaultChecked = elem.checked;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var destElements, node, clone, i, srcElements,
			inPage = jQuery.contains( elem.ownerDocument, elem );

		if ( jQuery.support.html5Clone || jQuery.isXMLDoc(elem) || !rnoshimcache.test( "<" + elem.nodeName + ">" ) ) {
			clone = elem.cloneNode( true );

		// IE<=8 does not properly clone detached, unknown element nodes
		} else {
			fragmentDiv.innerHTML = elem.outerHTML;
			fragmentDiv.removeChild( clone = fragmentDiv.firstChild );
		}

		if ( (!jQuery.support.noCloneEvent || !jQuery.support.noCloneChecked) &&
				(elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {

			// We eschew Sizzle here for performance reasons: http://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			// Fix all IE cloning issues
			for ( i = 0; (node = srcElements[i]) != null; ++i ) {
				// Ensure that the destination node is not null; Fixes #9587
				if ( destElements[i] ) {
					fixCloneNodeIssues( node, destElements[i] );
				}
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0; (node = srcElements[i]) != null; i++ ) {
					cloneCopyEvent( node, destElements[i] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		destElements = srcElements = node = null;

		// Return the cloned set
		return clone;
	},

	buildFragment: function( elems, context, scripts, selection ) {
		var j, elem, contains,
			tmp, tag, tbody, wrap,
			l = elems.length,

			// Ensure a safe fragment
			safe = createSafeFragment( context ),

			nodes = [],
			i = 0;

		for ( ; i < l; i++ ) {
			elem = elems[ i ];

			if ( elem || elem === 0 ) {

				// Add nodes directly
				if ( jQuery.type( elem ) === "object" ) {
					jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

				// Convert non-html into a text node
				} else if ( !rhtml.test( elem ) ) {
					nodes.push( context.createTextNode( elem ) );

				// Convert html into DOM nodes
				} else {
					tmp = tmp || safe.appendChild( context.createElement("div") );

					// Deserialize a standard representation
					tag = ( rtagName.exec( elem ) || ["", ""] )[1].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;

					tmp.innerHTML = wrap[1] + elem.replace( rxhtmlTag, "<$1></$2>" ) + wrap[2];

					// Descend through wrappers to the right content
					j = wrap[0];
					while ( j-- ) {
						tmp = tmp.lastChild;
					}

					// Manually add leading whitespace removed by IE
					if ( !jQuery.support.leadingWhitespace && rleadingWhitespace.test( elem ) ) {
						nodes.push( context.createTextNode( rleadingWhitespace.exec( elem )[0] ) );
					}

					// Remove IE's autoinserted <tbody> from table fragments
					if ( !jQuery.support.tbody ) {

						// String was a <table>, *may* have spurious <tbody>
						elem = tag === "table" && !rtbody.test( elem ) ?
							tmp.firstChild :

							// String was a bare <thead> or <tfoot>
							wrap[1] === "<table>" && !rtbody.test( elem ) ?
								tmp :
								0;

						j = elem && elem.childNodes.length;
						while ( j-- ) {
							if ( jQuery.nodeName( (tbody = elem.childNodes[j]), "tbody" ) && !tbody.childNodes.length ) {
								elem.removeChild( tbody );
							}
						}
					}

					jQuery.merge( nodes, tmp.childNodes );

					// Fix #12392 for WebKit and IE > 9
					tmp.textContent = "";

					// Fix #12392 for oldIE
					while ( tmp.firstChild ) {
						tmp.removeChild( tmp.firstChild );
					}

					// Remember the top-level container for proper cleanup
					tmp = safe.lastChild;
				}
			}
		}

		// Fix #11356: Clear elements from fragment
		if ( tmp ) {
			safe.removeChild( tmp );
		}

		// Reset defaultChecked for any radios and checkboxes
		// about to be appended to the DOM in IE 6/7 (#8060)
		if ( !jQuery.support.appendChecked ) {
			jQuery.grep( getAll( nodes, "input" ), fixDefaultChecked );
		}

		i = 0;
		while ( (elem = nodes[ i++ ]) ) {

			// #4087 - If origin and destination elements are the same, and this is
			// that element, do not do anything
			if ( selection && jQuery.inArray( elem, selection ) !== -1 ) {
				continue;
			}

			contains = jQuery.contains( elem.ownerDocument, elem );

			// Append to fragment
			tmp = getAll( safe.appendChild( elem ), "script" );

			// Preserve script evaluation history
			if ( contains ) {
				setGlobalEval( tmp );
			}

			// Capture executables
			if ( scripts ) {
				j = 0;
				while ( (elem = tmp[ j++ ]) ) {
					if ( rscriptType.test( elem.type || "" ) ) {
						scripts.push( elem );
					}
				}
			}
		}

		tmp = null;

		return safe;
	},

	cleanData: function( elems, /* internal */ acceptData ) {
		var elem, type, id, data,
			i = 0,
			internalKey = jQuery.expando,
			cache = jQuery.cache,
			deleteExpando = jQuery.support.deleteExpando,
			special = jQuery.event.special;

		for ( ; (elem = elems[i]) != null; i++ ) {

			if ( acceptData || jQuery.acceptData( elem ) ) {

				id = elem[ internalKey ];
				data = id && cache[ id ];

				if ( data ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Remove cache only if it was not already removed by jQuery.event.remove
					if ( cache[ id ] ) {

						delete cache[ id ];

						// IE does not allow us to delete expando properties from nodes,
						// nor does it have a removeAttribute function on Document nodes;
						// we must handle all of these cases
						if ( deleteExpando ) {
							delete elem[ internalKey ];

						} else if ( typeof elem.removeAttribute !== core_strundefined ) {
							elem.removeAttribute( internalKey );

						} else {
							elem[ internalKey ] = null;
						}

						core_deletedIds.push( id );
					}
				}
			}
		}
	}
});
var iframe, getStyles, curCSS,
	ralpha = /alpha\([^)]*\)/i,
	ropacity = /opacity\s*=\s*([^)]*)/,
	rposition = /^(top|right|bottom|left)$/,
	// swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// see here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rmargin = /^margin/,
	rnumsplit = new RegExp( "^(" + core_pnum + ")(.*)$", "i" ),
	rnumnonpx = new RegExp( "^(" + core_pnum + ")(?!px)[a-z%]+$", "i" ),
	rrelNum = new RegExp( "^([+-])=(" + core_pnum + ")", "i" ),
	elemdisplay = { BODY: "block" },

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: 0,
		fontWeight: 400
	},

	cssExpand = [ "Top", "Right", "Bottom", "Left" ],
	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ];

// return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// check for vendor prefixed names
	var capName = name.charAt(0).toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function isHidden( elem, el ) {
	// isHidden might be called from jQuery#filter function;
	// in that case, element will be second argument
	elem = el || elem;
	return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
}

function showHide( elements, show ) {
	var display, elem, hidden,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		values[ index ] = jQuery._data( elem, "olddisplay" );
		display = elem.style.display;
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = jQuery._data( elem, "olddisplay", css_defaultDisplay(elem.nodeName) );
			}
		} else {

			if ( !values[ index ] ) {
				hidden = isHidden( elem );

				if ( display && display !== "none" || !hidden ) {
					jQuery._data( elem, "olddisplay", hidden ? display : jQuery.css( elem, "display" ) );
				}
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

jQuery.fn.extend({
	css: function( name, value ) {
		return jQuery.access( this, function( elem, name, value ) {
			var len, styles,
				map = {},
				i = 0;

			if ( jQuery.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		var bool = typeof state === "boolean";

		return this.each(function() {
			if ( bool ? state : isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});

jQuery.extend({
	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {
					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Exclude the following css properties to add px
	cssNumber: {
		"columnCount": true,
		"fillOpacity": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		// normalize float css property
		"float": jQuery.support.cssFloat ? "cssFloat" : "styleFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {
		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// convert relative number strings (+= or -=) to relative numbers. #7345
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that NaN and null values aren't set. See: #7116
			if ( value == null || type === "number" && isNaN( value ) ) {
				return;
			}

			// If a number was passed in, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// Fixes #8908, it can be done more correctly by specifing setters in cssHooks,
			// but it would mean to define eight (for every problematic property) identical functions
			if ( !jQuery.support.clearCloneStyle && value === "" && name.indexOf("background") === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {

				// Wrapped to prevent IE from throwing errors when 'invalid' values are provided
				// Fixes bug #5509
				try {
					style[ name ] = value;
				} catch(e) {}
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var num, val, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		//convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Return, converting to number if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	},

	// A method for quickly swapping in/out CSS properties to get correct calculations
	swap: function( elem, options, callback, args ) {
		var ret, name,
			old = {};

		// Remember the old values, and insert the new ones
		for ( name in options ) {
			old[ name ] = elem.style[ name ];
			elem.style[ name ] = options[ name ];
		}

		ret = callback.apply( elem, args || [] );

		// Revert the old values
		for ( name in options ) {
			elem.style[ name ] = old[ name ];
		}

		return ret;
	}
});

// NOTE: we've included the "window" in window.getComputedStyle
// because jsdom on node.js will break without it.
if ( window.getComputedStyle ) {
	getStyles = function( elem ) {
		return window.getComputedStyle( elem, null );
	};

	curCSS = function( elem, name, _computed ) {
		var width, minWidth, maxWidth,
			computed = _computed || getStyles( elem ),

			// getPropertyValue is only needed for .css('filter') in IE9, see #12537
			ret = computed ? computed.getPropertyValue( name ) || computed[ name ] : undefined,
			style = elem.style;

		if ( computed ) {

			if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
				ret = jQuery.style( elem, name );
			}

			// A tribute to the "awesome hack by Dean Edwards"
			// Chrome < 17 and Safari 5.0 uses "computed value" instead of "used value" for margin-right
			// Safari 5.1.7 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
			// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
			if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {

				// Remember the original values
				width = style.width;
				minWidth = style.minWidth;
				maxWidth = style.maxWidth;

				// Put in the new values to get a computed value out
				style.minWidth = style.maxWidth = style.width = ret;
				ret = computed.width;

				// Revert the changed values
				style.width = width;
				style.minWidth = minWidth;
				style.maxWidth = maxWidth;
			}
		}

		return ret;
	};
} else if ( document.documentElement.currentStyle ) {
	getStyles = function( elem ) {
		return elem.currentStyle;
	};

	curCSS = function( elem, name, _computed ) {
		var left, rs, rsLeft,
			computed = _computed || getStyles( elem ),
			ret = computed ? computed[ name ] : undefined,
			style = elem.style;

		// Avoid setting ret to empty string here
		// so we don't default to auto
		if ( ret == null && style && style[ name ] ) {
			ret = style[ name ];
		}

		// From the awesome hack by Dean Edwards
		// http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

		// If we're not dealing with a regular pixel number
		// but a number that has a weird ending, we need to convert it to pixels
		// but not position css attributes, as those are proportional to the parent element instead
		// and we can't measure the parent instead because it might trigger a "stacking dolls" problem
		if ( rnumnonpx.test( ret ) && !rposition.test( name ) ) {

			// Remember the original values
			left = style.left;
			rs = elem.runtimeStyle;
			rsLeft = rs && rs.left;

			// Put in the new values to get a computed value out
			if ( rsLeft ) {
				rs.left = elem.currentStyle.left;
			}
			style.left = name === "fontSize" ? "1em" : ret;
			ret = style.pixelLeft + "px";

			// Revert the changed values
			style.left = left;
			if ( rsLeft ) {
				rs.left = rsLeft;
			}
		}

		return ret === "" ? "auto" : ret;
	};
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
		value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox, styles ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			val += jQuery.css( elem, extra + cssExpand[ i ], true, styles );
		}

		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// at this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		} else {
			// at this point, extra isn't content, so add padding
			val += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// at this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var valueIsBorderBox = true,
		val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		styles = getStyles( elem ),
		isBorderBox = jQuery.support.boxSizing && jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

	// some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name, styles );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// we need the check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox && ( jQuery.support.boxSizingReliable || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles
		)
	) + "px";
}

// Try to determine the default display value of an element
function css_defaultDisplay( nodeName ) {
	var doc = document,
		display = elemdisplay[ nodeName ];

	if ( !display ) {
		display = actualDisplay( nodeName, doc );

		// If the simple way fails, read from inside an iframe
		if ( display === "none" || !display ) {
			// Use the already-created iframe if possible
			iframe = ( iframe ||
				jQuery("<iframe frameborder='0' width='0' height='0'/>")
				.css( "cssText", "display:block !important" )
			).appendTo( doc.documentElement );

			// Always write a new HTML skeleton so Webkit and Firefox don't choke on reuse
			doc = ( iframe[0].contentWindow || iframe[0].contentDocument ).document;
			doc.write("<!doctype html><html><body>");
			doc.close();

			display = actualDisplay( nodeName, doc );
			iframe.detach();
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;
	}

	return display;
}

// Called ONLY from within css_defaultDisplay
function actualDisplay( name, doc ) {
	var elem = jQuery( doc.createElement( name ) ).appendTo( doc.body ),
		display = jQuery.css( elem[0], "display" );
	elem.remove();
	return display;
}

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {
				// certain elements can have dimension info if we invisibly show them
				// however, it must have a current display style that would benefit from this
				return elem.offsetWidth === 0 && rdisplayswap.test( jQuery.css( elem, "display" ) ) ?
					jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					}) :
					getWidthOrHeight( elem, name, extra );
			}
		},

		set: function( elem, value, extra ) {
			var styles = extra && getStyles( elem );
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					jQuery.support.boxSizing && jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					styles
				) : 0
			);
		}
	};
});

if ( !jQuery.support.opacity ) {
	jQuery.cssHooks.opacity = {
		get: function( elem, computed ) {
			// IE uses filters for opacity
			return ropacity.test( (computed && elem.currentStyle ? elem.currentStyle.filter : elem.style.filter) || "" ) ?
				( 0.01 * parseFloat( RegExp.$1 ) ) + "" :
				computed ? "1" : "";
		},

		set: function( elem, value ) {
			var style = elem.style,
				currentStyle = elem.currentStyle,
				opacity = jQuery.isNumeric( value ) ? "alpha(opacity=" + value * 100 + ")" : "",
				filter = currentStyle && currentStyle.filter || style.filter || "";

			// IE has trouble with opacity if it does not have layout
			// Force it by setting the zoom level
			style.zoom = 1;

			// if setting opacity to 1, and no other filters exist - attempt to remove filter attribute #6652
			// if value === "", then remove inline opacity #12685
			if ( ( value >= 1 || value === "" ) &&
					jQuery.trim( filter.replace( ralpha, "" ) ) === "" &&
					style.removeAttribute ) {

				// Setting style.filter to null, "" & " " still leave "filter:" in the cssText
				// if "filter:" is present at all, clearType is disabled, we want to avoid this
				// style.removeAttribute is IE Only, but so apparently is this code path...
				style.removeAttribute( "filter" );

				// if there is no filter style applied in a css rule or unset inline opacity, we are done
				if ( value === "" || currentStyle && !currentStyle.filter ) {
					return;
				}
			}

			// otherwise, set new filter values
			style.filter = ralpha.test( filter ) ?
				filter.replace( ralpha, opacity ) :
				filter + " " + opacity;
		}
	};
}

// These hooks cannot be added until DOM ready because the support test
// for it is not run until after DOM ready
jQuery(function() {
	if ( !jQuery.support.reliableMarginRight ) {
		jQuery.cssHooks.marginRight = {
			get: function( elem, computed ) {
				if ( computed ) {
					// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
					// Work around by temporarily setting element display to inline-block
					return jQuery.swap( elem, { "display": "inline-block" },
						curCSS, [ elem, "marginRight" ] );
				}
			}
		};
	}

	// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
	// getComputedStyle returns percent when specified for top/left/bottom/right
	// rather than make the css module depend on the offset module, we just check for it here
	if ( !jQuery.support.pixelPosition && jQuery.fn.position ) {
		jQuery.each( [ "top", "left" ], function( i, prop ) {
			jQuery.cssHooks[ prop ] = {
				get: function( elem, computed ) {
					if ( computed ) {
						computed = curCSS( elem, prop );
						// if curCSS returns percentage, fallback to offset
						return rnumnonpx.test( computed ) ?
							jQuery( elem ).position()[ prop ] + "px" :
							computed;
					}
				}
			};
		});
	}

});

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.hidden = function( elem ) {
		// Support: Opera <= 12.12
		// Opera reports offsetWidths and offsetHeights less than zero on some elements
		return elem.offsetWidth <= 0 && elem.offsetHeight <= 0 ||
			(!jQuery.support.reliableHiddenOffsets && ((elem.style && elem.style.display) || jQuery.css( elem, "display" )) === "none");
	};

	jQuery.expr.filters.visible = function( elem ) {
		return !jQuery.expr.filters.hidden( elem );
	};
}

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});
var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function(){
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function(){
			var type = this.type;
			// Use .is(":disabled") so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !manipulation_rcheckableType.test( type ) );
		})
		.map(function( i, elem ){
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ){
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});

//Serialize an array of form elements or a set of
//key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// Item is non-scalar (array or object), encode its numeric index.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}
jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
});

jQuery.fn.hover = function( fnOver, fnOut ) {
	return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
};
var
	// Document location
	ajaxLocParts,
	ajaxLocation,
	ajax_nonce = jQuery.now(),

	ajax_rquery = /\?/,
	rhash = /#.*$/,
	rts = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rurl = /^([\w.+-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/,

	// Keep a copy of the old load method
	_load = jQuery.fn.load,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat("*");

// #8138, IE may throw an exception when accessing
// a field from window.location if document.domain has been set
try {
	ajaxLocation = location.href;
} catch( e ) {
	// Use the href attribute of an A element
	// since IE will modify it given document.location
	ajaxLocation = document.createElement( "a" );
	ajaxLocation.href = "";
	ajaxLocation = ajaxLocation.href;
}

// Segment location into parts
ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( core_rnotwhite ) || [];

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			while ( (dataType = dataTypes[i++]) ) {
				// Prepend if requested
				if ( dataType[0] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					(structure[ dataType ] = structure[ dataType ] || []).unshift( func );

				// Otherwise append
				} else {
					(structure[ dataType ] = structure[ dataType ] || []).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if( typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[ dataTypeOrTransport ] ) {
				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		});
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var deep, key,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || (deep = {}) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	var selector, response, type,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = url.slice( off, url.length );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax({
			url: url,

			// if "type" variable is undefined, then "GET" method will be used
			type: type,
			dataType: "html",
			data: params
		}).done(function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery("<div>").append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		}).complete( callback && function( jqXHR, status ) {
			self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
		});
	}

	return this;
};

// Attach a bunch of functions for handling common AJAX events
jQuery.each( [ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], function( i, type ){
	jQuery.fn[ type ] = function( fn ){
		return this.on( type, fn );
	};
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		});
	};
});

jQuery.extend({

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: ajaxLocation,
		type: "GET",
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": window.String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var // Cross-domain detection vars
			parts,
			// Loop variable
			i,
			// URL without anti-cache param
			cacheURL,
			// Response headers as string
			responseHeadersString,
			// timeout handle
			timeoutTimer,

			// To know if global events are to be dispatched
			fireGlobals,

			transport,
			// Response headers
			responseHeaders,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context && ( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks("once memory"),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( (match = rheaders.exec( responseHeadersString )) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					var lname = name.toLowerCase();
					if ( !state ) {
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( state < 2 ) {
							for ( code in map ) {
								// Lazy-add the new callback in a way that preserves old ones
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						} else {
							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR ).complete = completeDeferred.add;
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (#5866: IE7 issue with protocol-less urls)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || ajaxLocation ) + "" ).replace( rhash, "" ).replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().match( core_rnotwhite ) || [""];

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? 80 : 443 ) ) !=
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? 80 : 443 ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		fireGlobals = s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger("ajaxStart");
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		cacheURL = s.url;

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				cacheURL = ( s.url += ( ajax_rquery.test( cacheURL ) ? "&" : "?" ) + s.data );
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add anti-cache in url if needed
			if ( s.cache === false ) {
				s.url = rts.test( cacheURL ) ?

					// If there is already a '_' parameter, set its value
					cacheURL.replace( rts, "$1_=" + ajax_nonce++ ) :

					// Otherwise add one to the end
					cacheURL + ( ajax_rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + ajax_nonce++;
			}
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
			// Abort if not done already and return
			return jqXHR.abort();
		}

		// aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout(function() {
					jqXHR.abort("timeout");
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch ( e ) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// If successful, handle type chaining
			if ( status >= 200 && status < 300 || status === 304 ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader("etag");
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 ) {
					isSuccess = true;
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					isSuccess = true;
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					isSuccess = ajaxConvert( s, response );
					statusText = isSuccess.state;
					success = isSuccess.data;
					error = isSuccess.error;
					isSuccess = !error;
				}
			} else {
				// We extract error from statusText
				// then normalize statusText and status for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger("ajaxStop");
				}
			}
		}

		return jqXHR;
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	}
});

/* Handles responses to an ajax request:
 * - sets all responseXXX fields accordingly
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {
	var firstDataType, ct, finalDataType, type,
		contents = s.contents,
		dataTypes = s.dataTypes,
		responseFields = s.responseFields;

	// Fill responseXXX fields
	for ( type in responseFields ) {
		if ( type in responses ) {
			jqXHR[ responseFields[type] ] = responses[ type ];
		}
	}

	// Remove auto dataType and get content-type in the process
	while( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

// Chain conversions given the request and the original response
function ajaxConvert( s, response ) {
	var conv2, current, conv, tmp,
		converters = {},
		i = 0,
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice(),
		prev = dataTypes[ 0 ];

	// Apply the dataFilter if provided
	if ( s.dataFilter ) {
		response = s.dataFilter( response, s.dataType );
	}

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	// Convert to each sequential dataType, tolerating list modification
	for ( ; (current = dataTypes[++i]); ) {

		// There's only work to do if current dataType is non-auto
		if ( current !== "*" ) {

			// Convert response if prev dataType is non-auto and differs from current
			if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split(" ");
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.splice( i--, 0, current );
								}

								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s["throws"] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}

			// Update prev for next iteration
			prev = current;
		}
	}

	return { state: "success", data: response };
}
// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and global
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
		s.global = false;
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function(s) {

	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {

		var script,
			head = document.head || jQuery("head")[0] || document.documentElement;

		return {

			send: function( _, callback ) {

				script = document.createElement("script");

				script.async = true;

				if ( s.scriptCharset ) {
					script.charset = s.scriptCharset;
				}

				script.src = s.url;

				// Attach handlers for all browsers
				script.onload = script.onreadystatechange = function( _, isAbort ) {

					if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

						// Handle memory leak in IE
						script.onload = script.onreadystatechange = null;

						// Remove the script
						if ( script.parentNode ) {
							script.parentNode.removeChild( script );
						}

						// Dereference the script
						script = null;

						// Callback if not abort
						if ( !isAbort ) {
							callback( 200, "success" );
						}
					}
				};

				// Circumvent IE6 bugs with base elements (#2709 and #4378) by prepending
				// Use native DOM manipulation to avoid our domManip AJAX trickery
				head.insertBefore( script, head.firstChild );
			},

			abort: function() {
				if ( script ) {
					script.onload( undefined, true );
				}
			}
		};
	}
});
var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( ajax_nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" && !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") && rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( ajax_rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});
var xhrCallbacks, xhrSupported,
	xhrId = 0,
	// #5280: Internet Explorer will keep connections alive if we don't abort on unload
	xhrOnUnloadAbort = window.ActiveXObject && function() {
		// Abort all pending requests
		var key;
		for ( key in xhrCallbacks ) {
			xhrCallbacks[ key ]( undefined, true );
		}
	};

// Functions to create xhrs
function createStandardXHR() {
	try {
		return new window.XMLHttpRequest();
	} catch( e ) {}
}

function createActiveXHR() {
	try {
		return new window.ActiveXObject("Microsoft.XMLHTTP");
	} catch( e ) {}
}

// Create the request object
// (This is still attached to ajaxSettings for backward compatibility)
jQuery.ajaxSettings.xhr = window.ActiveXObject ?
	/* Microsoft failed to properly
	 * implement the XMLHttpRequest in IE7 (can't request local files),
	 * so we use the ActiveXObject when it is available
	 * Additionally XMLHttpRequest can be disabled in IE7/IE8 so
	 * we need a fallback.
	 */
	function() {
		return !this.isLocal && createStandardXHR() || createActiveXHR();
	} :
	// For all other browsers, use the standard XMLHttpRequest object
	createStandardXHR;

// Determine support properties
xhrSupported = jQuery.ajaxSettings.xhr();
jQuery.support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
xhrSupported = jQuery.support.ajax = !!xhrSupported;

// Create transport if the browser can provide an xhr
if ( xhrSupported ) {

	jQuery.ajaxTransport(function( s ) {
		// Cross domain only allowed if supported through XMLHttpRequest
		if ( !s.crossDomain || jQuery.support.cors ) {

			var callback;

			return {
				send: function( headers, complete ) {

					// Get a new xhr
					var handle, i,
						xhr = s.xhr();

					// Open the socket
					// Passing null username, generates a login popup on Opera (#2865)
					if ( s.username ) {
						xhr.open( s.type, s.url, s.async, s.username, s.password );
					} else {
						xhr.open( s.type, s.url, s.async );
					}

					// Apply custom fields if provided
					if ( s.xhrFields ) {
						for ( i in s.xhrFields ) {
							xhr[ i ] = s.xhrFields[ i ];
						}
					}

					// Override mime type if needed
					if ( s.mimeType && xhr.overrideMimeType ) {
						xhr.overrideMimeType( s.mimeType );
					}

					// X-Requested-With header
					// For cross-domain requests, seeing as conditions for a preflight are
					// akin to a jigsaw puzzle, we simply never set it to be sure.
					// (it can always be set on a per-request basis or even using ajaxSetup)
					// For same-domain requests, won't change header if already provided.
					if ( !s.crossDomain && !headers["X-Requested-With"] ) {
						headers["X-Requested-With"] = "XMLHttpRequest";
					}

					// Need an extra try/catch for cross domain requests in Firefox 3
					try {
						for ( i in headers ) {
							xhr.setRequestHeader( i, headers[ i ] );
						}
					} catch( err ) {}

					// Do send the request
					// This may raise an exception which is actually
					// handled in jQuery.ajax (so no try/catch here)
					xhr.send( ( s.hasContent && s.data ) || null );

					// Listener
					callback = function( _, isAbort ) {
						var status, responseHeaders, statusText, responses;

						// Firefox throws exceptions when accessing properties
						// of an xhr when a network error occurred
						// http://helpful.knobs-dials.com/index.php/Component_returned_failure_code:_0x80040111_(NS_ERROR_NOT_AVAILABLE)
						try {

							// Was never called and is aborted or complete
							if ( callback && ( isAbort || xhr.readyState === 4 ) ) {

								// Only called once
								callback = undefined;

								// Do not keep as active anymore
								if ( handle ) {
									xhr.onreadystatechange = jQuery.noop;
									if ( xhrOnUnloadAbort ) {
										delete xhrCallbacks[ handle ];
									}
								}

								// If it's an abort
								if ( isAbort ) {
									// Abort it manually if needed
									if ( xhr.readyState !== 4 ) {
										xhr.abort();
									}
								} else {
									responses = {};
									status = xhr.status;
									responseHeaders = xhr.getAllResponseHeaders();

									// When requesting binary data, IE6-9 will throw an exception
									// on any attempt to access responseText (#11426)
									if ( typeof xhr.responseText === "string" ) {
										responses.text = xhr.responseText;
									}

									// Firefox throws an exception when accessing
									// statusText for faulty cross-domain requests
									try {
										statusText = xhr.statusText;
									} catch( e ) {
										// We normalize with Webkit giving an empty statusText
										statusText = "";
									}

									// Filter status for non standard behaviors

									// If the request is local and we have data: assume a success
									// (success with no data won't get notified, that's the best we
									// can do given current implementations)
									if ( !status && s.isLocal && !s.crossDomain ) {
										status = responses.text ? 200 : 404;
									// IE - #1450: sometimes returns 1223 when it should be 204
									} else if ( status === 1223 ) {
										status = 204;
									}
								}
							}
						} catch( firefoxAccessException ) {
							if ( !isAbort ) {
								complete( -1, firefoxAccessException );
							}
						}

						// Call complete if needed
						if ( responses ) {
							complete( status, statusText, responses, responseHeaders );
						}
					};

					if ( !s.async ) {
						// if we're in sync mode we fire the callback
						callback();
					} else if ( xhr.readyState === 4 ) {
						// (IE6 & IE7) if it's in cache and has been
						// retrieved directly we need to fire the callback
						setTimeout( callback );
					} else {
						handle = ++xhrId;
						if ( xhrOnUnloadAbort ) {
							// Create the active xhrs callbacks list if needed
							// and attach the unload handler
							if ( !xhrCallbacks ) {
								xhrCallbacks = {};
								jQuery( window ).unload( xhrOnUnloadAbort );
							}
							// Add to list of active xhrs callbacks
							xhrCallbacks[ handle ] = callback;
						}
						xhr.onreadystatechange = callback;
					}
				},

				abort: function() {
					if ( callback ) {
						callback( undefined, true );
					}
				}
			};
		}
	});
}
var fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([+-])=|)(" + core_pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [function( prop, value ) {
			var end, unit,
				tween = this.createTween( prop, value ),
				parts = rfxnum.exec( value ),
				target = tween.cur(),
				start = +target || 0,
				scale = 1,
				maxIterations = 20;

			if ( parts ) {
				end = +parts[2];
				unit = parts[3] || ( jQuery.cssNumber[ prop ] ? "" : "px" );

				// We need to compute starting value
				if ( unit !== "px" && start ) {
					// Iteratively approximate from a nonzero starting point
					// Prefer the current property, because this process will be trivial if it uses the same units
					// Fallback to end or a simple constant
					start = jQuery.css( tween.elem, prop, true ) || end || 1;

					do {
						// If previous iteration zeroed out, double until we get *something*
						// Use a string for doubling factor so we don't accidentally see scale as unchanged below
						scale = scale || ".5";

						// Adjust and apply
						start = start / scale;
						jQuery.style( tween.elem, prop, start + unit );

					// Update scale, tolerating zero or NaN from tween.cur()
					// And breaking the loop if scale is unchanged or perfect, or if we've just had enough
					} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
				}

				tween.unit = unit;
				tween.start = start;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[1] ? start + ( parts[1] + 1 ) * end : end;
			}
			return tween;
		}]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	});
	return ( fxNow = jQuery.now() );
}

function createTweens( animation, props ) {
	jQuery.each( props, function( prop, value ) {
		var collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
			index = 0,
			length = collection.length;
		for ( ; index < length; index++ ) {
			if ( collection[ index ].call( animation, prop, value ) ) {

				// we're done with this property
				return;
			}
		}
	});
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// archaic crash bug won't allow us to use 1 - ( 0.5 || 0 ) (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// if we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// resolve when we played the last frame
				// otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	createTweens( animation, props );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

function propFilter( props, specialEasing ) {
	var value, name, index, easing, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// not quite $.extend, this wont overwrite keys already present.
			// also - reusing 'index' from above because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

jQuery.Animation = jQuery.extend( Animation, {

	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

function defaultPrefilter( elem, props, opts ) {
	/*jshint validthis:true */
	var prop, index, length,
		value, dataShow, toggle,
		tween, hooks, oldfire,
		anim = this,
		style = elem.style,
		orig = {},
		handled = [],
		hidden = elem.nodeType && isHidden( elem );

	// handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// doing this makes sure that the complete handler will be called
			// before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE does not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		if ( jQuery.css( elem, "display" ) === "inline" &&
				jQuery.css( elem, "float" ) === "none" ) {

			// inline-level elements accept inline-block;
			// block-level elements need to be inline with layout
			if ( !jQuery.support.inlineBlockNeedsLayout || css_defaultDisplay( elem.nodeName ) === "inline" ) {
				style.display = "inline-block";

			} else {
				style.zoom = 1;
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		if ( !jQuery.support.shrinkWrapBlocks ) {
			anim.always(function() {
				style.overflow = opts.overflow[ 0 ];
				style.overflowX = opts.overflow[ 1 ];
				style.overflowY = opts.overflow[ 2 ];
			});
		}
	}


	// show/hide pass
	for ( index in props ) {
		value = props[ index ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ index ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {
				continue;
			}
			handled.push( index );
		}
	}

	length = handled.length;
	if ( length ) {
		dataShow = jQuery._data( elem, "fxshow" ) || jQuery._data( elem, "fxshow", {} );
		if ( "hidden" in dataShow ) {
			hidden = dataShow.hidden;
		}

		// store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;
			jQuery._removeData( elem, "fxshow" );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( index = 0 ; index < length ; index++ ) {
			prop = handled[ index ];
			tween = anim.createTween( prop, hidden ? dataShow[ prop ] : 0 );
			orig[ prop ] = dataShow[ prop ] || jQuery.style( elem, prop );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}
	}
}

function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails
			// so, simple values such as "10px" are parsed to Float.
			// complex values such as "rotate(1rad)" are returned as is.
			result = jQuery.css( tween.elem, tween.prop, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// use step hook for back compat - use cssHook if its there - use .style if its
			// available and use plain properties where available
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Remove in 2.0 - this supports IE8's panic based approach
// to setting things on disconnected nodes

Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );
				doAnimation.finish = function() {
					anim.stop( true );
				};
				// Empty animations, or finishing resolves immediately
				if ( empty || jQuery._data( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = jQuery._data( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// start the next in the queue if the last step wasn't forced
			// timers currently will call their complete callbacks, which will dequeue
			// but only if they were gotoEnd
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each(function() {
			var index,
				data = jQuery._data( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// enable finishing flag on private data
			data.finish = true;

			// empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.cur && hooks.cur.finish ) {
				hooks.cur.finish.call( this );
			}

			// look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// turn off finishing flag
			delete data.finish;
		});
	}
});

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		attrs = { height: type },
		i = 0;

	// if we include width, step value is 1 to do all cssExpand values,
	// if we don't include width, step value is 2 to skip over Left and Right
	includeWidth = includeWidth? 1 : 0;
	for( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p*Math.PI ) / 2;
	}
};

jQuery.timers = [];
jQuery.fx = Tween.prototype.init;
jQuery.fx.tick = function() {
	var timer,
		timers = jQuery.timers,
		i = 0;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	if ( timer() && jQuery.timers.push( timer ) ) {
		jQuery.fx.start();
	}
};

jQuery.fx.interval = 13;

jQuery.fx.start = function() {
	if ( !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};

// Back Compat <1.8 extension point
jQuery.fx.step = {};

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.animated = function( elem ) {
		return jQuery.grep(jQuery.timers, function( fn ) {
			return elem === fn.elem;
		}).length;
	};
}
jQuery.fn.offset = function( options ) {
	if ( arguments.length ) {
		return options === undefined ?
			this :
			this.each(function( i ) {
				jQuery.offset.setOffset( this, options, i );
			});
	}

	var docElem, win,
		box = { top: 0, left: 0 },
		elem = this[ 0 ],
		doc = elem && elem.ownerDocument;

	if ( !doc ) {
		return;
	}

	docElem = doc.documentElement;

	// Make sure it's not a disconnected DOM node
	if ( !jQuery.contains( docElem, elem ) ) {
		return box;
	}

	// If we don't have gBCR, just use 0,0 rather than error
	// BlackBerry 5, iOS 3 (original iPhone)
	if ( typeof elem.getBoundingClientRect !== core_strundefined ) {
		box = elem.getBoundingClientRect();
	}
	win = getWindow( doc );
	return {
		top: box.top  + ( win.pageYOffset || docElem.scrollTop )  - ( docElem.clientTop  || 0 ),
		left: box.left + ( win.pageXOffset || docElem.scrollLeft ) - ( docElem.clientLeft || 0 )
	};
};

jQuery.offset = {

	setOffset: function( elem, options, i ) {
		var position = jQuery.css( elem, "position" );

		// set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		var curElem = jQuery( elem ),
			curOffset = curElem.offset(),
			curCSSTop = jQuery.css( elem, "top" ),
			curCSSLeft = jQuery.css( elem, "left" ),
			calculatePosition = ( position === "absolute" || position === "fixed" ) && jQuery.inArray("auto", [curCSSTop, curCSSLeft]) > -1,
			props = {}, curPosition = {}, curTop, curLeft;

		// need to be able to calculate position if either top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;
		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );
		} else {
			curElem.css( props );
		}
	}
};


jQuery.fn.extend({

	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset,
			parentOffset = { top: 0, left: 0 },
			elem = this[ 0 ];

		// fixed elements are offset from window (parentOffset = {top:0, left: 0}, because it is it's only offset parent
		if ( jQuery.css( elem, "position" ) === "fixed" ) {
			// we assume that getBoundingClientRect is available when computed position is fixed
			offset = elem.getBoundingClientRect();
		} else {
			// Get *real* offsetParent
			offsetParent = this.offsetParent();

			// Get correct offsets
			offset = this.offset();
			if ( !jQuery.nodeName( offsetParent[ 0 ], "html" ) ) {
				parentOffset = offsetParent.offset();
			}

			// Add offsetParent borders
			parentOffset.top  += jQuery.css( offsetParent[ 0 ], "borderTopWidth", true );
			parentOffset.left += jQuery.css( offsetParent[ 0 ], "borderLeftWidth", true );
		}

		// Subtract parent offsets and element margins
		// note: when an element has margin: auto the offsetLeft and marginLeft
		// are the same in Safari causing offset.left to incorrectly be 0
		return {
			top:  offset.top  - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true)
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || document.documentElement;
			while ( offsetParent && ( !jQuery.nodeName( offsetParent, "html" ) && jQuery.css( offsetParent, "position") === "static" ) ) {
				offsetParent = offsetParent.offsetParent;
			}
			return offsetParent || document.documentElement;
		});
	}
});


// Create scrollLeft and scrollTop methods
jQuery.each( {scrollLeft: "pageXOffset", scrollTop: "pageYOffset"}, function( method, prop ) {
	var top = /Y/.test( prop );

	jQuery.fn[ method ] = function( val ) {
		return jQuery.access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? (prop in win) ? win[ prop ] :
					win.document.documentElement[ method ] :
					elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : jQuery( win ).scrollLeft(),
					top ? val : jQuery( win ).scrollTop()
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

function getWindow( elem ) {
	return jQuery.isWindow( elem ) ?
		elem :
		elem.nodeType === 9 ?
			elem.defaultView || elem.parentWindow :
			false;
}
// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return jQuery.access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height], whichever is greatest
					// unfortunately, this causes bug #3838 in IE6/8 only, but there is currently no good, small way to fix it.
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});
// Limit scope pollution from any deprecated API
// (function() {

// })();
// Expose jQuery to the global object
window.jQuery = window.$ = jQuery;

// Expose jQuery as an AMD module, but only for AMD loaders that
// understand the issues with loading multiple versions of jQuery
// in a page that all might call define(). The loader will indicate
// they have special allowances for multiple jQuery versions by
// specifying define.amd.jQuery = true. Register as a named module,
// since jQuery can be concatenated with other files that may use define,
// but not use a proper concatenation script that understands anonymous
// AMD modules. A named AMD is safest and most robust way to register.
// Lowercase jquery is used because AMD module names are derived from
// file names, and jQuery is normally delivered in a lowercase file name.
// Do this after creating the global so that if an AMD module wants to call
// noConflict to hide this version of jQuery, it will work.
if ( typeof define === "function" && define.amd && define.amd.jQuery ) {
	define( "jquery", [], function () { return jQuery; } );
}

})( window );
(function() {
  var Bacon, Bus, Dispatcher, End, Error, Event, EventStream, Initial, Next, None, Observable, Property, PropertyDispatcher, Some, addPropertyInitValueToStream, assert, assertArray, assertEvent, assertFunction, assertString, cloneArray, cloneObject, end, former, indexOf, initial, isEvent, isFieldKey, isFunction, latter, makeFunction, methodCall, next, nop, partiallyApplied, remove, sendWrapped, toCombinator, toEvent, toFieldExtractor, toFieldKey, toOption, toSimpleExtractor, _, _ref,
    __slice = [].slice,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  if ((_ref = this.jQuery || this.Zepto) != null) {
    _ref.fn.asEventStream = function(eventName, selector, eventTransformer) {
      var element;
      if (eventTransformer == null) {
        eventTransformer = _.id;
      }
      if (isFunction(selector)) {
        eventTransformer = selector;
        selector = null;
      }
      element = this;
      return new EventStream(function(sink) {
        var handler, unbind;
        handler = function() {
          var args, reply;
          args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
          reply = sink(next(eventTransformer.apply(null, args)));
          if (reply === Bacon.noMore) {
            return unbind();
          }
        };
        unbind = function() {
          return element.off(eventName, selector, handler);
        };
        element.on(eventName, selector, handler);
        return unbind;
      });
    };
  }

  Bacon = this.Bacon = {};

  Bacon.fromPromise = function(promise) {
    return new EventStream(function(sink) {
      var onError, onSuccess;
      onSuccess = function(value) {
        sink(next(value));
        return sink(end());
      };
      onError = function(e) {
        sink(new Error(e));
        return sink(end());
      };
      promise.then(onSuccess, onError);
      return nop;
    });
  };

  Bacon.noMore = ["<no-more>"];

  Bacon.more = ["<more>"];

  Bacon.later = function(delay, value) {
    return Bacon.sequentially(delay, [value]);
  };

  Bacon.sequentially = function(delay, values) {
    var index, poll;
    index = -1;
    poll = function() {
      index++;
      if (index < values.length) {
        return toEvent(values[index]);
      } else {
        return end();
      }
    };
    return Bacon.fromPoll(delay, poll);
  };

  Bacon.repeatedly = function(delay, values) {
    var index, poll;
    index = -1;
    poll = function() {
      index++;
      return toEvent(values[index % values.length]);
    };
    return Bacon.fromPoll(delay, poll);
  };

  Bacon.fromCallback = function() {
    var args, f;
    f = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    f = makeFunction(f, args);
    return new EventStream(function(sink) {
      var handler;
      handler = function(value) {
        sink(next(value));
        return sink(end());
      };
      f(handler);
      return nop;
    });
  };

  Bacon.fromPoll = function(delay, poll) {
    return new EventStream(function(sink) {
      var handler, id, unbind;
      id = void 0;
      handler = function() {
        var reply, value;
        value = poll();
        reply = sink(value);
        if (reply === Bacon.noMore || value.isEnd()) {
          return unbind();
        }
      };
      unbind = function() {
        return clearInterval(id);
      };
      id = setInterval(handler, delay);
      return unbind;
    });
  };

  Bacon.fromEventTarget = function(target, eventName, eventTransformer) {
    if (eventTransformer == null) {
      eventTransformer = _.id;
    }
    return new EventStream(function(sink) {
      var handler, unbind;
      handler = function() {
        var args, reply;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        reply = sink(next(eventTransformer.apply(null, args)));
        if (reply === Bacon.noMore) {
          return unbind();
        }
      };
      if (target.addEventListener) {
        unbind = function() {
          return target.removeEventListener(eventName, handler, false);
        };
        target.addEventListener(eventName, handler, false);
      } else {
        unbind = function() {
          return target.removeListener(eventName, handler);
        };
        target.addListener(eventName, handler);
      }
      return unbind;
    });
  };

  Bacon.interval = function(delay, value) {
    var poll;
    if (value == null) {
      value = {};
    }
    poll = function() {
      return next(value);
    };
    return Bacon.fromPoll(delay, poll);
  };

  Bacon.constant = function(value) {
    return new Property(sendWrapped([value], initial));
  };

  Bacon.never = function() {
    return Bacon.fromArray([]);
  };

  Bacon.once = function(value) {
    return Bacon.fromArray([value]);
  };

  Bacon.fromArray = function(values) {
    return new EventStream(sendWrapped(values, next));
  };

  sendWrapped = function(values, wrapper) {
    return function(sink) {
      var value, _i, _len;
      for (_i = 0, _len = values.length; _i < _len; _i++) {
        value = values[_i];
        sink(wrapper(value));
      }
      sink(end());
      return nop;
    };
  };

  Bacon.combineAll = function(streams, f) {
    var next, stream, _i, _len, _ref1;
    assertArray(streams);
    stream = _.head(streams);
    _ref1 = _.tail(streams);
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      next = _ref1[_i];
      stream = f(stream, next);
    }
    return stream;
  };

  Bacon.mergeAll = function(streams) {
    return Bacon.combineAll(streams, function(s1, s2) {
      return s1.merge(s2);
    });
  };

  Bacon.combineAsArray = function() {
    var more, next, stream, streams, _i, _len, _ref1;
    streams = arguments[0], more = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    if (!(streams instanceof Array)) {
      streams = [streams].concat(more);
    }
    if (streams.length) {
      stream = (_.head(streams)).toProperty().map(function(x) {
        return [x];
      });
      _ref1 = _.tail(streams);
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        next = _ref1[_i];
        stream = stream.combine(next, function(xs, x) {
          return xs.concat([x]);
        });
      }
      return stream;
    } else {
      return Bacon.constant([]);
    }
  };

  Bacon.combineWith = function(streams, f) {
    return Bacon.combineAll(streams, function(s1, s2) {
      return s1.toProperty().combine(s2, f);
    });
  };

  Bacon.combineTemplate = function(template) {
    var applyStreamValue, combinator, compile, compileTemplate, constantValue, current, funcs, mkContext, setValue, streams;
    funcs = [];
    streams = [];
    current = function(ctxStack) {
      return ctxStack[ctxStack.length - 1];
    };
    setValue = function(ctxStack, key, value) {
      return current(ctxStack)[key] = value;
    };
    applyStreamValue = function(key, index) {
      return function(ctxStack, values) {
        return setValue(ctxStack, key, values[index]);
      };
    };
    constantValue = function(key, value) {
      return function(ctxStack, values) {
        return setValue(ctxStack, key, value);
      };
    };
    mkContext = function(template) {
      if (template instanceof Array) {
        return [];
      } else {
        return {};
      }
    };
    compile = function(key, value) {
      var popContext, pushContext;
      if (value instanceof Observable) {
        streams.push(value);
        return funcs.push(applyStreamValue(key, streams.length - 1));
      } else if (typeof value === "object") {
        pushContext = function(key) {
          return function(ctxStack, values) {
            var newContext;
            newContext = mkContext(value);
            setValue(ctxStack, key, newContext);
            return ctxStack.push(newContext);
          };
        };
        popContext = function(ctxStack, values) {
          return ctxStack.pop();
        };
        funcs.push(pushContext(key));
        compileTemplate(value);
        return funcs.push(popContext);
      } else {
        return funcs.push(constantValue(key, value));
      }
    };
    compileTemplate = function(template) {
      return _.each(template, compile);
    };
    compileTemplate(template);
    combinator = function(values) {
      var ctxStack, f, rootContext, _i, _len;
      rootContext = mkContext(template);
      ctxStack = [rootContext];
      for (_i = 0, _len = funcs.length; _i < _len; _i++) {
        f = funcs[_i];
        f(ctxStack, values);
      }
      return rootContext;
    };
    return Bacon.combineAsArray(streams).map(combinator);
  };

  Event = (function() {

    function Event() {}

    Event.prototype.isEvent = function() {
      return true;
    };

    Event.prototype.isEnd = function() {
      return false;
    };

    Event.prototype.isInitial = function() {
      return false;
    };

    Event.prototype.isNext = function() {
      return false;
    };

    Event.prototype.isError = function() {
      return false;
    };

    Event.prototype.hasValue = function() {
      return false;
    };

    Event.prototype.filter = function(f) {
      return true;
    };

    Event.prototype.getOriginalEvent = function() {
      if (this.sourceEvent != null) {
        return this.sourceEvent.getOriginalEvent();
      } else {
        return this;
      }
    };

    Event.prototype.onDone = function(listener) {
      return listener();
    };

    return Event;

  })();

  Next = (function(_super) {

    __extends(Next, _super);

    function Next(value, sourceEvent) {
      this.value = isFunction(value) ? value : _.always(value);
    }

    Next.prototype.isNext = function() {
      return true;
    };

    Next.prototype.hasValue = function() {
      return true;
    };

    Next.prototype.fmap = function(f) {
      return this.apply(f(this.value()));
    };

    Next.prototype.apply = function(value) {
      return next(value, this.getOriginalEvent());
    };

    Next.prototype.filter = function(f) {
      return f(this.value());
    };

    Next.prototype.describe = function() {
      return this.value();
    };

    return Next;

  })(Event);

  Initial = (function(_super) {

    __extends(Initial, _super);

    function Initial() {
      return Initial.__super__.constructor.apply(this, arguments);
    }

    Initial.prototype.isInitial = function() {
      return true;
    };

    Initial.prototype.isNext = function() {
      return false;
    };

    Initial.prototype.apply = function(value) {
      return initial(value, this.getOriginalEvent());
    };

    Initial.prototype.toNext = function() {
      return new Next(this.value, this.getOriginalEvent());
    };

    return Initial;

  })(Next);

  End = (function(_super) {

    __extends(End, _super);

    function End() {
      return End.__super__.constructor.apply(this, arguments);
    }

    End.prototype.isEnd = function() {
      return true;
    };

    End.prototype.fmap = function() {
      return this;
    };

    End.prototype.apply = function() {
      return this;
    };

    End.prototype.describe = function() {
      return "<end>";
    };

    return End;

  })(Event);

  Error = (function(_super) {

    __extends(Error, _super);

    function Error(error) {
      this.error = error;
    }

    Error.prototype.isError = function() {
      return true;
    };

    Error.prototype.fmap = function() {
      return this;
    };

    Error.prototype.apply = function() {
      return this;
    };

    Error.prototype.describe = function() {
      return "<error> " + this.error;
    };

    return Error;

  })(Event);

  Observable = (function() {

    function Observable() {
      this.flatMapLatest = __bind(this.flatMapLatest, this);

      this.scan = __bind(this.scan, this);

      this.takeUntil = __bind(this.takeUntil, this);
      this.assign = this.onValue;
    }

    Observable.prototype.onValue = function() {
      var args, f;
      f = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      f = makeFunction(f, args);
      return this.subscribe(function(event) {
        if (event.hasValue()) {
          return f(event.value());
        }
      });
    };

    Observable.prototype.onValues = function(f) {
      return this.onValue(function(args) {
        return f.apply(null, args);
      });
    };

    Observable.prototype.onError = function() {
      var args, f;
      f = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      f = makeFunction(f, args);
      return this.subscribe(function(event) {
        if (event.isError()) {
          return f(event.error);
        }
      });
    };

    Observable.prototype.onEnd = function() {
      var args, f;
      f = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      f = makeFunction(f, args);
      return this.subscribe(function(event) {
        if (event.isEnd()) {
          return f();
        }
      });
    };

    Observable.prototype.errors = function() {
      return this.filter(function() {
        return false;
      });
    };

    Observable.prototype.filter = function() {
      var args, f;
      f = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      f = makeFunction(f, args);
      return this.withHandler(function(event) {
        if (event.filter(f)) {
          return this.push(event);
        } else {
          return Bacon.more;
        }
      });
    };

    Observable.prototype.takeWhile = function() {
      var args, f;
      f = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      f = makeFunction(f, args);
      return this.withHandler(function(event) {
        if (event.filter(f)) {
          return this.push(event);
        } else {
          this.push(end());
          return Bacon.noMore;
        }
      });
    };

    Observable.prototype.endOnError = function() {
      return this.withHandler(function(event) {
        if (event.isError()) {
          this.push(event);
          return this.push(end());
        } else {
          return this.push(event);
        }
      });
    };

    Observable.prototype.take = function(count) {
      assert("take: count must >= 1", count >= 1);
      return this.withHandler(function(event) {
        if (!event.hasValue()) {
          return this.push(event);
        } else if (count === 1) {
          this.push(event);
          this.push(end());
          return Bacon.noMore;
        } else {
          count--;
          return this.push(event);
        }
      });
    };

    Observable.prototype.map = function() {
      var args, f;
      f = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      f = makeFunction(f, args);
      return this.withHandler(function(event) {
        return this.push(event.fmap(f));
      });
    };

    Observable.prototype.mapError = function() {
      var args, f;
      f = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      f = makeFunction(f, args);
      return this.withHandler(function(event) {
        if (event.isError()) {
          return this.push(next(f(event.error)));
        } else {
          return this.push(event);
        }
      });
    };

    Observable.prototype.doAction = function() {
      var args, f;
      f = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      f = makeFunction(f, args);
      return this.withHandler(function(event) {
        if (event.hasValue()) {
          f(event.value());
        }
        return this.push(event);
      });
    };

    Observable.prototype.takeUntil = function(stopper) {
      var src;
      src = this;
      return this.withSubscribe(function(sink) {
        var srcSink, stopperSink, unsubBoth, unsubSrc, unsubStopper, unsubscribed;
        unsubscribed = false;
        unsubSrc = nop;
        unsubStopper = nop;
        unsubBoth = function() {
          unsubSrc();
          unsubStopper();
          return unsubscribed = true;
        };
        srcSink = function(event) {
          if (event.isEnd()) {
            unsubStopper();
            sink(event);
            return Bacon.noMore;
          } else {
            event.getOriginalEvent().onDone(function() {
              var reply;
              if (!unsubscribed) {
                reply = sink(event);
                if (reply === Bacon.noMore) {
                  return unsubBoth();
                }
              }
            });
            return Bacon.more;
          }
        };
        stopperSink = function(event) {
          if (event.isError()) {
            return Bacon.more;
          } else if (event.isEnd()) {
            return Bacon.noMore;
          } else {
            unsubSrc();
            sink(end());
            return Bacon.noMore;
          }
        };
        unsubSrc = src.subscribe(srcSink);
        if (!unsubscribed) {
          unsubStopper = stopper.subscribe(stopperSink);
        }
        return unsubBoth;
      });
    };

    Observable.prototype.skip = function(count) {
      assert("skip: count must >= 0", count >= 0);
      return this.withHandler(function(event) {
        if (!event.hasValue()) {
          return this.push(event);
        } else if (count > 0) {
          count--;
          return Bacon.more;
        } else {
          return this.push(event);
        }
      });
    };

    Observable.prototype.distinctUntilChanged = function() {
      return this.skipDuplicates();
    };

    Observable.prototype.skipDuplicates = function(isEqual) {
      if (isEqual == null) {
        isEqual = function(a, b) {
          return a === b;
        };
      }
      return this.withStateMachine(None, function(prev, event) {
        if (!event.hasValue()) {
          return [prev, [event]];
        } else if (prev === None || !isEqual(prev.get(), event.value())) {
          return [new Some(event.value()), [event]];
        } else {
          return [prev, []];
        }
      });
    };

    Observable.prototype.withStateMachine = function(initState, f) {
      var state;
      state = initState;
      return this.withHandler(function(event) {
        var fromF, newState, output, outputs, reply, _i, _len;
        fromF = f(state, event);
        assertArray(fromF);
        newState = fromF[0], outputs = fromF[1];
        assertArray(outputs);
        state = newState;
        reply = Bacon.more;
        for (_i = 0, _len = outputs.length; _i < _len; _i++) {
          output = outputs[_i];
          reply = this.push(output);
          if (reply === Bacon.noMore) {
            return reply;
          }
        }
        return reply;
      });
    };

    Observable.prototype.scan = function(seed, f) {
      var acc, subscribe,
        _this = this;
      f = toCombinator(f);
      acc = toOption(seed);
      subscribe = function(sink) {
        var initSent, unsub;
        initSent = false;
        unsub = _this.subscribe(function(event) {
          if (event.hasValue()) {
            if (initSent && event.isInitial()) {
              return Bacon.more;
            } else {
              initSent = true;
              acc = new Some(f(acc.getOrElse(void 0), event.value()));
              return sink(event.apply(acc.get()));
            }
          } else {
            if (event.isEnd()) {
              initSent = true;
            }
            return sink(event);
          }
        });
        if (!initSent) {
          acc.forEach(function(value) {
            var reply;
            reply = sink(initial(value));
            if (reply === Bacon.noMore) {
              unsub();
              return unsub = nop;
            }
          });
        }
        return unsub;
      };
      return new Property(new PropertyDispatcher(subscribe).subscribe);
    };

    Observable.prototype.diff = function(start, f) {
      f = toCombinator(f);
      return this.scan([start], function(prevTuple, next) {
        return [next, f(prevTuple[0], next)];
      }).filter(function(tuple) {
        return tuple.length === 2;
      }).map(function(tuple) {
        return tuple[1];
      });
    };

    Observable.prototype.flatMap = function(f) {
      var root;
      root = this;
      return new EventStream(function(sink) {
        var checkEnd, children, rootEnd, spawner, unbind, unsubRoot;
        children = [];
        rootEnd = false;
        unsubRoot = function() {};
        unbind = function() {
          var unsubChild, _i, _len;
          unsubRoot();
          for (_i = 0, _len = children.length; _i < _len; _i++) {
            unsubChild = children[_i];
            unsubChild();
          }
          return children = [];
        };
        checkEnd = function() {
          if (rootEnd && (children.length === 0)) {
            return sink(end());
          }
        };
        spawner = function(event) {
          var child, childEnded, handler, removeChild, unsubChild;
          if (event.isEnd()) {
            rootEnd = true;
            return checkEnd();
          } else if (event.isError()) {
            return sink(event);
          } else {
            child = f(event.value());
            unsubChild = void 0;
            childEnded = false;
            removeChild = function() {
              if (unsubChild != null) {
                remove(unsubChild, children);
              }
              return checkEnd();
            };
            handler = function(event) {
              var reply;
              if (event.isEnd()) {
                removeChild();
                childEnded = true;
                return Bacon.noMore;
              } else {
                if (event instanceof Initial) {
                  event = event.toNext();
                }
                reply = sink(event);
                if (reply === Bacon.noMore) {
                  unbind();
                }
                return reply;
              }
            };
            unsubChild = child.subscribe(handler);
            if (!childEnded) {
              return children.push(unsubChild);
            }
          }
        };
        unsubRoot = root.subscribe(spawner);
        return unbind;
      });
    };

    Observable.prototype.flatMapLatest = function(f) {
      var stream,
        _this = this;
      stream = this.toEventStream();
      return stream.flatMap(function(value) {
        return f(value).takeUntil(stream);
      });
    };

    Observable.prototype.not = function() {
      return this.map(function(x) {
        return !x;
      });
    };

    Observable.prototype.log = function() {
      this.subscribe(function(event) {
        return console.log(event.describe());
      });
      return this;
    };

    Observable.prototype.slidingWindow = function(n) {
      return this.scan([], function(window, value) {
        return window.concat([value]).slice(-n);
      });
    };

    return Observable;

  })();

  EventStream = (function(_super) {

    __extends(EventStream, _super);

    function EventStream(subscribe) {
      var dispatcher;
      EventStream.__super__.constructor.call(this);
      assertFunction(subscribe);
      dispatcher = new Dispatcher(subscribe);
      this.subscribe = dispatcher.subscribe;
      this.hasSubscribers = dispatcher.hasSubscribers;
    }

    EventStream.prototype.map = function() {
      var args, p;
      p = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      if (p instanceof Property) {
        return p.sampledBy(this, former);
      } else {
        return EventStream.__super__.map.apply(this, [p].concat(__slice.call(args)));
      }
    };

    EventStream.prototype.filter = function() {
      var args, p;
      p = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      if (p instanceof Property) {
        return p.sampledBy(this, function(p, s) {
          return [p, s];
        }).filter(function(_arg) {
          var p, s;
          p = _arg[0], s = _arg[1];
          return p;
        }).map(function(_arg) {
          var p, s;
          p = _arg[0], s = _arg[1];
          return s;
        });
      } else {
        return EventStream.__super__.filter.apply(this, [p].concat(__slice.call(args)));
      }
    };

    EventStream.prototype.delay = function(delay) {
      return this.flatMap(function(value) {
        return Bacon.later(delay, value);
      });
    };

    EventStream.prototype.throttle = function(delay) {
      return this.flatMapLatest(function(value) {
        return Bacon.later(delay, value);
      });
    };

    EventStream.prototype.bufferWithTime = function(delay) {
      var buffer, flush, storeAndMaybeTrigger, values;
      values = [];
      storeAndMaybeTrigger = function(value) {
        values.push(value);
        return values.length === 1;
      };
      flush = function() {
        var output;
        output = values;
        values = [];
        return output;
      };
      buffer = function() {
        return Bacon.later(delay).map(flush);
      };
      return this.filter(storeAndMaybeTrigger).flatMap(buffer);
    };

    EventStream.prototype.bufferWithCount = function(count) {
      var values;
      values = [];
      return this.withHandler(function(event) {
        var flush,
          _this = this;
        flush = function() {
          _this.push(next(values, event));
          return values = [];
        };
        if (event.isError()) {
          return this.push(event);
        } else if (event.isEnd()) {
          flush();
          return this.push(event);
        } else {
          values.push(event.value());
          if (values.length === count) {
            return flush();
          }
        }
      });
    };

    EventStream.prototype.merge = function(right) {
      var left;
      left = this;
      return new EventStream(function(sink) {
        var ends, smartSink, unsubBoth, unsubLeft, unsubRight, unsubscribed;
        unsubLeft = nop;
        unsubRight = nop;
        unsubscribed = false;
        unsubBoth = function() {
          unsubLeft();
          unsubRight();
          return unsubscribed = true;
        };
        ends = 0;
        smartSink = function(event) {
          var reply;
          if (event.isEnd()) {
            ends++;
            if (ends === 2) {
              return sink(end());
            } else {
              return Bacon.more;
            }
          } else {
            reply = sink(event);
            if (reply === Bacon.noMore) {
              unsubBoth();
            }
            return reply;
          }
        };
        unsubLeft = left.subscribe(smartSink);
        if (!unsubscribed) {
          unsubRight = right.subscribe(smartSink);
        }
        return unsubBoth;
      });
    };

    EventStream.prototype.toProperty = function(initValue) {
      if (arguments.length === 0) {
        initValue = None;
      }
      return this.scan(initValue, latter);
    };

    EventStream.prototype.toEventStream = function() {
      return this;
    };

    EventStream.prototype.concat = function(right) {
      var left;
      left = this;
      return new EventStream(function(sink) {
        var unsub;
        unsub = left.subscribe(function(e) {
          if (e.isEnd()) {
            return unsub = right.subscribe(sink);
          } else {
            return sink(e);
          }
        });
        return function() {
          return unsub();
        };
      });
    };

    EventStream.prototype.awaiting = function(other) {
      return this.map(true).merge(other.map(false)).toProperty(false);
    };

    EventStream.prototype.startWith = function(seed) {
      return Bacon.once(seed).concat(this);
    };

    EventStream.prototype.mapEnd = function() {
      var args, f;
      f = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      f = makeFunction(f, args);
      return this.withHandler(function(event) {
        if (event.isEnd()) {
          this.push(next(f(event)));
          this.push(end());
          return Bacon.noMore;
        } else {
          return this.push(event);
        }
      });
    };

    EventStream.prototype.withHandler = function(handler) {
      var dispatcher;
      dispatcher = new Dispatcher(this.subscribe, handler);
      return new EventStream(dispatcher.subscribe);
    };

    EventStream.prototype.withSubscribe = function(subscribe) {
      return new EventStream(subscribe);
    };

    return EventStream;

  })(Observable);

  Property = (function(_super) {

    __extends(Property, _super);

    function Property(subscribe) {
      var combine,
        _this = this;
      this.subscribe = subscribe;
      this.toEventStream = __bind(this.toEventStream, this);

      this.toProperty = __bind(this.toProperty, this);

      this.changes = __bind(this.changes, this);

      this.sample = __bind(this.sample, this);

      Property.__super__.constructor.call(this);
      combine = function(other, leftSink, rightSink) {
        var myVal, otherVal;
        myVal = None;
        otherVal = None;
        return new Property(function(sink) {
          var checkEnd, combiningSink, initialSent, myEnd, mySink, otherEnd, otherSink, unsubBoth, unsubMe, unsubOther, unsubscribed;
          unsubscribed = false;
          unsubMe = nop;
          unsubOther = nop;
          unsubBoth = function() {
            unsubMe();
            unsubOther();
            return unsubscribed = true;
          };
          myEnd = false;
          otherEnd = false;
          checkEnd = function() {
            var reply;
            if (myEnd && otherEnd) {
              reply = sink(end());
              if (reply === Bacon.noMore) {
                unsubBoth();
              }
              return reply;
            }
          };
          initialSent = false;
          combiningSink = function(markEnd, setValue, thisSink) {
            return function(event) {
              var reply;
              if (event.isEnd()) {
                markEnd();
                checkEnd();
                return Bacon.noMore;
              } else if (event.isError()) {
                reply = sink(event);
                if (reply === Bacon.noMore) {
                  unsubBoth();
                }
                return reply;
              } else {
                setValue(new Some(event.value()));
                if (myVal.isDefined && otherVal.isDefined) {
                  if (initialSent && event.isInitial()) {
                    return Bacon.more;
                  } else {
                    initialSent = true;
                    reply = thisSink(sink, event, myVal.value, otherVal.value);
                    if (reply === Bacon.noMore) {
                      unsubBoth();
                    }
                    return reply;
                  }
                } else {
                  return Bacon.more;
                }
              }
            };
          };
          mySink = combiningSink((function() {
            return myEnd = true;
          }), (function(value) {
            return myVal = value;
          }), leftSink);
          otherSink = combiningSink((function() {
            return otherEnd = true;
          }), (function(value) {
            return otherVal = value;
          }), rightSink);
          unsubMe = _this.subscribe(mySink);
          if (!unsubscribed) {
            unsubOther = other.subscribe(otherSink);
          }
          return unsubBoth;
        });
      };
      this.combine = function(other, f) {
        var combinator, combineAndPush;
        combinator = toCombinator(f);
        combineAndPush = function(sink, event, myVal, otherVal) {
          return sink(event.apply(combinator(myVal, otherVal)));
        };
        return combine(other, combineAndPush, combineAndPush);
      };
      this.sampledBy = function(sampler, combinator) {
        var pushPropertyValue;
        if (combinator == null) {
          combinator = former;
        }
        combinator = toCombinator(combinator);
        pushPropertyValue = function(sink, event, propertyVal, streamVal) {
          return sink(event.apply(combinator(propertyVal, streamVal)));
        };
        return combine(sampler, nop, pushPropertyValue).changes().takeUntil(sampler.filter(false).mapEnd());
      };
    }

    Property.prototype.sample = function(interval) {
      return this.sampledBy(Bacon.interval(interval, {}));
    };

    Property.prototype.changes = function() {
      var _this = this;
      return new EventStream(function(sink) {
        return _this.subscribe(function(event) {
          if (!event.isInitial()) {
            return sink(event);
          }
        });
      });
    };

    Property.prototype.withHandler = function(handler) {
      return new Property(new PropertyDispatcher(this.subscribe, handler).subscribe);
    };

    Property.prototype.withSubscribe = function(subscribe) {
      return new Property(new PropertyDispatcher(subscribe).subscribe);
    };

    Property.prototype.toProperty = function() {
      return this;
    };

    Property.prototype.toEventStream = function() {
      var _this = this;
      return new EventStream(function(sink) {
        return _this.subscribe(function(event) {
          if (event.isInitial()) {
            event = event.toNext();
          }
          return sink(event);
        });
      });
    };

    Property.prototype.and = function(other) {
      return this.combine(other, function(x, y) {
        return x && y;
      });
    };

    Property.prototype.or = function(other) {
      return this.combine(other, function(x, y) {
        return x || y;
      });
    };

    Property.prototype.decode = function(cases) {
      return this.combine(Bacon.combineTemplate(cases), function(key, values) {
        return values[key];
      });
    };

    Property.prototype.delay = function(delay) {
      return addPropertyInitValueToStream(this, this.changes().delay(delay));
    };

    Property.prototype.throttle = function(delay) {
      return addPropertyInitValueToStream(this, this.changes().throttle(delay));
    };

    return Property;

  })(Observable);

  addPropertyInitValueToStream = function(property, stream) {
    var getInitValue;
    getInitValue = function(property) {
      var value;
      value = None;
      property.subscribe(function(event) {
        if (event.isInitial()) {
          value = new Some(event.value());
        }
        return Bacon.noMore;
      });
      return value;
    };
    return stream.toProperty(getInitValue(property));
  };

  Dispatcher = (function() {

    function Dispatcher(subscribe, handleEvent) {
      var ended, removeSink, sinks, unsubscribeFromSource,
        _this = this;
      if (subscribe == null) {
        subscribe = function() {
          return nop;
        };
      }
      sinks = [];
      ended = false;
      this.hasSubscribers = function() {
        return sinks.length > 0;
      };
      unsubscribeFromSource = nop;
      removeSink = function(sink) {
        return remove(sink, sinks);
      };
      this.push = function(event) {
        var done, reply, sink, waiters, _i, _len, _ref1;
        waiters = void 0;
        done = function() {
          var w, ws, _i, _len;
          if (waiters != null) {
            ws = waiters;
            waiters = void 0;
            for (_i = 0, _len = ws.length; _i < _len; _i++) {
              w = ws[_i];
              w();
            }
          }
          return event.onDone = Event.prototype.onDone;
        };
        event.onDone = function(listener) {
          if ((waiters != null) && !_.contains(waiters, listener)) {
            return waiters.push(listener);
          } else {
            return waiters = [listener];
          }
        };
        assertEvent(event);
        _ref1 = cloneArray(sinks);
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          sink = _ref1[_i];
          reply = sink(event);
          if (reply === Bacon.noMore || event.isEnd()) {
            removeSink(sink);
          }
        }
        done();
        if (_this.hasSubscribers()) {
          return Bacon.more;
        } else {
          return Bacon.noMore;
        }
      };
      if (handleEvent == null) {
        handleEvent = function(event) {
          return this.push(event);
        };
      }
      this.handleEvent = function(event) {
        assertEvent(event);
        if (event.isEnd()) {
          ended = true;
        }
        return handleEvent.apply(_this, [event]);
      };
      this.subscribe = function(sink) {
        if (ended) {
          sink(end());
          return nop;
        } else {
          assertFunction(sink);
          sinks.push(sink);
          if (sinks.length === 1) {
            unsubscribeFromSource = subscribe(_this.handleEvent);
          }
          assertFunction(unsubscribeFromSource);
          return function() {
            removeSink(sink);
            if (!_this.hasSubscribers()) {
              return unsubscribeFromSource();
            }
          };
        }
      };
    }

    return Dispatcher;

  })();

  PropertyDispatcher = (function(_super) {

    __extends(PropertyDispatcher, _super);

    function PropertyDispatcher(subscribe, handleEvent) {
      var current, ended, push,
        _this = this;
      PropertyDispatcher.__super__.constructor.call(this, subscribe, handleEvent);
      current = None;
      push = this.push;
      subscribe = this.subscribe;
      ended = false;
      this.push = function(event) {
        if (event.isEnd()) {
          ended = true;
        }
        if (event.hasValue()) {
          current = new Some(event.value());
        }
        return push.apply(_this, [event]);
      };
      this.subscribe = function(sink) {
        var initSent, reply, shouldBounceInitialValue;
        initSent = false;
        shouldBounceInitialValue = function() {
          return _this.hasSubscribers() || ended;
        };
        reply = current.filter(shouldBounceInitialValue).map(function(val) {
          return sink(initial(val));
        });
        if (reply.getOrElse(Bacon.more) === Bacon.noMore) {
          return nop;
        } else if (ended) {
          sink(end());
          return nop;
        } else {
          return subscribe.apply(_this, [sink]);
        }
      };
    }

    return PropertyDispatcher;

  })(Dispatcher);

  Bus = (function(_super) {

    __extends(Bus, _super);

    function Bus() {
      var dispatcher, ended, guardedSink, sink, subscribeAll, subscribeInput, subscribeThis, subscriptions, unsubAll, unsubscribeInput,
        _this = this;
      sink = void 0;
      subscriptions = [];
      ended = false;
      guardedSink = function(input) {
        return function(event) {
          if (event.isEnd()) {
            unsubscribeInput(input);
            return Bacon.noMore;
          } else {
            return sink(event);
          }
        };
      };
      unsubAll = function() {
        var sub, _i, _len;
        for (_i = 0, _len = subscriptions.length; _i < _len; _i++) {
          sub = subscriptions[_i];
          if (sub.unsub != null) {
            sub.unsub();
          }
        }
        return subscriptions = [];
      };
      subscribeInput = function(subscription) {
        return subscription.unsub = subscription.input.subscribe(guardedSink(subscription.input));
      };
      unsubscribeInput = function(input) {
        var i, sub, _i, _len;
        for (i = _i = 0, _len = subscriptions.length; _i < _len; i = ++_i) {
          sub = subscriptions[i];
          if (sub.input === input) {
            if (sub.unsub != null) {
              sub.unsub();
            }
            subscriptions.splice(i, 1);
            return;
          }
        }
      };
      subscribeAll = function(newSink) {
        var subscription, unsubFuncs, _i, _len, _ref1;
        sink = newSink;
        unsubFuncs = [];
        _ref1 = cloneArray(subscriptions);
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          subscription = _ref1[_i];
          subscribeInput(subscription);
        }
        return unsubAll;
      };
      dispatcher = new Dispatcher(subscribeAll);
      subscribeThis = function(sink) {
        return dispatcher.subscribe(sink);
      };
      Bus.__super__.constructor.call(this, subscribeThis);
      this.plug = function(input) {
        var sub;
        if (ended) {
          return;
        }
        sub = {
          input: input
        };
        subscriptions.push(sub);
        if ((sink != null)) {
          subscribeInput(sub);
        }
        return function() {
          return unsubscribeInput(input);
        };
      };
      this.push = function(value) {
        if (sink != null) {
          return sink(next(value));
        }
      };
      this.error = function(error) {
        if (sink != null) {
          return sink(new Error(error));
        }
      };
      this.end = function() {
        ended = true;
        unsubAll();
        if (sink != null) {
          return sink(end());
        }
      };
    }

    return Bus;

  })(EventStream);

  Some = (function() {

    function Some(value) {
      this.value = value;
    }

    Some.prototype.getOrElse = function() {
      return this.value;
    };

    Some.prototype.get = function() {
      return this.value;
    };

    Some.prototype.filter = function(f) {
      if (f(this.value)) {
        return new Some(this.value);
      } else {
        return None;
      }
    };

    Some.prototype.map = function(f) {
      return new Some(f(this.value));
    };

    Some.prototype.forEach = function(f) {
      return f(this.value);
    };

    Some.prototype.isDefined = true;

    Some.prototype.toArray = function() {
      return [this.value];
    };

    return Some;

  })();

  None = {
    getOrElse: function(value) {
      return value;
    },
    filter: function() {
      return None;
    },
    map: function() {
      return None;
    },
    forEach: function() {},
    isDefined: false,
    toArray: function() {
      return [];
    }
  };

  Bacon.EventStream = EventStream;

  Bacon.Property = Property;

  Bacon.Observable = Observable;

  Bacon.Bus = Bus;

  Bacon.Initial = Initial;

  Bacon.Next = Next;

  Bacon.End = End;

  Bacon.Error = Error;

  nop = function() {};

  latter = function(_, x) {
    return x;
  };

  former = function(x, _) {
    return x;
  };

  initial = function(value) {
    return new Initial(_.always(value));
  };

  next = function(value) {
    return new Next(_.always(value));
  };

  end = function() {
    return new End();
  };

  isEvent = function(x) {
    return (x != null) && (x.isEvent != null) && x.isEvent();
  };

  toEvent = function(x) {
    if (isEvent(x)) {
      return x;
    } else {
      return next(x);
    }
  };

  cloneArray = function(xs) {
    return xs.slice(0);
  };

  cloneObject = function(src) {
    var clone, key, value;
    clone = {};
    for (key in src) {
      value = src[key];
      clone[key] = value;
    }
    return clone;
  };

  indexOf = Array.prototype.indexOf ? function(xs, x) {
    return xs.indexOf(x);
  } : function(xs, x) {
    var i, y, _i, _len;
    for (i = _i = 0, _len = xs.length; _i < _len; i = ++_i) {
      y = xs[i];
      if (x === y) {
        return i;
      }
    }
    return -1;
  };

  remove = function(x, xs) {
    var i;
    i = indexOf(xs, x);
    if (i >= 0) {
      return xs.splice(i, 1);
    }
  };

  assert = function(message, condition) {
    if (!condition) {
      throw message;
    }
  };

  assertEvent = function(event) {
    assert("not an event : " + event, event.isEvent != null);
    return assert("not event", event.isEvent());
  };

  assertFunction = function(f) {
    return assert("not a function : " + f, isFunction(f));
  };

  isFunction = function(f) {
    return typeof f === "function";
  };

  assertArray = function(xs) {
    return assert("not an array : " + xs, xs instanceof Array);
  };

  assertString = function(x) {
    return assert("not a string : " + x, typeof x === "string");
  };

  methodCall = function(obj, method, args) {
    assertString(method);
    if (args === void 0) {
      args = [];
    }
    return function(value) {
      return obj[method].apply(obj, args.concat([value]));
    };
  };

  partiallyApplied = function(f, args) {
    return function(value) {
      return f.apply(null, args.concat([value]));
    };
  };

  makeFunction = function(f, args) {
    if (isFunction(f)) {
      if (args.length) {
        return partiallyApplied(f, args);
      } else {
        return f;
      }
    } else if (isFieldKey(f)) {
      return toFieldExtractor(f, args);
    } else if (typeof f === "object" && args.length) {
      return methodCall(f, _.head(args), _.tail(args));
    } else {
      return _.always(f);
    }
  };

  isFieldKey = function(f) {
    return (typeof f === "string") && f.length > 1 && f.charAt(0) === ".";
  };

  Bacon.isFieldKey = isFieldKey;

  toFieldExtractor = function(f, args) {
    var partFuncs, parts;
    parts = f.slice(1).split(".");
    partFuncs = _.map(toSimpleExtractor(args), parts);
    return function(value) {
      var _i, _len;
      for (_i = 0, _len = partFuncs.length; _i < _len; _i++) {
        f = partFuncs[_i];
        value = f(value);
      }
      return value;
    };
  };

  toSimpleExtractor = function(args) {
    return function(key) {
      return function(value) {
        var fieldValue;
        fieldValue = value[key];
        if (isFunction(fieldValue)) {
          return fieldValue.apply(value, args);
        } else {
          return fieldValue;
        }
      };
    };
  };

  toFieldKey = function(f) {
    return f.slice(1);
  };

  toCombinator = function(f) {
    var key;
    if (isFunction(f)) {
      return f;
    } else if (isFieldKey(f)) {
      key = toFieldKey(f);
      return function(left, right) {
        return left[key](right);
      };
    } else {
      return assert("not a function or a field key: " + f, false);
    }
  };

  toOption = function(v) {
    if (v instanceof Some || v === None) {
      return v;
    } else {
      return new Some(v);
    }
  };

  if ((typeof define !== "undefined" && define !== null) && (define.amd != null)) {
    if (typeof define === "function") {
      define('bacon',[],function() {
        return Bacon;
      });
    }
  }

  _ = {
    head: function(xs) {
      return xs[0];
    },
    always: function(x) {
      return function() {
        return x;
      };
    },
    empty: function(xs) {
      return xs.length === 0;
    },
    tail: function(xs) {
      return xs.slice(1, xs.length);
    },
    filter: function(f, xs) {
      var filtered, x, _i, _len;
      filtered = [];
      for (_i = 0, _len = xs.length; _i < _len; _i++) {
        x = xs[_i];
        if (f(x)) {
          filtered.push(x);
        }
      }
      return filtered;
    },
    map: function(f, xs) {
      var x, _i, _len, _results;
      _results = [];
      for (_i = 0, _len = xs.length; _i < _len; _i++) {
        x = xs[_i];
        _results.push(f(x));
      }
      return _results;
    },
    each: function(xs, f) {
      var key, value, _results;
      _results = [];
      for (key in xs) {
        value = xs[key];
        _results.push(f(key, value));
      }
      return _results;
    },
    contains: function(xs, x) {
      return indexOf(xs, x) !== -1;
    },
    id: function(x) {
      return x;
    },
    last: function(xs) {
      return xs[xs.length - 1];
    }
  };

  Bacon._ = _;

}).call(this);

// CodeMirror is the only global var we claim
window.CodeMirror = (function() {
  

  // BROWSER SNIFFING

  // Crude, but necessary to handle a number of hard-to-feature-detect
  // bugs and behavior differences.
  var gecko = /gecko\/\d/i.test(navigator.userAgent);
  var ie = /MSIE \d/.test(navigator.userAgent);
  var ie_lt8 = ie && (document.documentMode == null || document.documentMode < 8);
  var ie_lt9 = ie && (document.documentMode == null || document.documentMode < 9);
  var webkit = /WebKit\//.test(navigator.userAgent);
  var qtwebkit = webkit && /Qt\/\d+\.\d+/.test(navigator.userAgent);
  var chrome = /Chrome\//.test(navigator.userAgent);
  var opera = /Opera\//.test(navigator.userAgent);
  var safari = /Apple Computer/.test(navigator.vendor);
  var khtml = /KHTML\//.test(navigator.userAgent);
  var mac_geLion = /Mac OS X 1\d\D([7-9]|\d\d)\D/.test(navigator.userAgent);
  var mac_geMountainLion = /Mac OS X 1\d\D([8-9]|\d\d)\D/.test(navigator.userAgent);
  var phantom = /PhantomJS/.test(navigator.userAgent);

  var ios = /AppleWebKit/.test(navigator.userAgent) && /Mobile\/\w+/.test(navigator.userAgent);
  // This is woefully incomplete. Suggestions for alternative methods welcome.
  var mobile = ios || /Android|webOS|BlackBerry|Opera Mini|Opera Mobi|IEMobile/i.test(navigator.userAgent);
  var mac = ios || /Mac/.test(navigator.platform);
  var windows = /windows/i.test(navigator.platform);

  var opera_version = opera && navigator.userAgent.match(/Version\/(\d*\.\d*)/);
  if (opera_version) opera_version = Number(opera_version[1]);
  // Some browsers use the wrong event properties to signal cmd/ctrl on OS X
  var flipCtrlCmd = mac && (qtwebkit || opera && (opera_version == null || opera_version < 12.11));
  var captureMiddleClick = gecko || (ie && !ie_lt9);

  // Optimize some code when these features are not used
  var sawReadOnlySpans = false, sawCollapsedSpans = false;

  // CONSTRUCTOR

  function CodeMirror(place, options) {
    if (!(this instanceof CodeMirror)) return new CodeMirror(place, options);
    
    this.options = options = options || {};
    // Determine effective options based on given values and defaults.
    for (var opt in defaults) if (!options.hasOwnProperty(opt) && defaults.hasOwnProperty(opt))
      options[opt] = defaults[opt];
    setGuttersForLineNumbers(options);

    var docStart = typeof options.value == "string" ? 0 : options.value.first;
    var display = this.display = makeDisplay(place, docStart);
    display.wrapper.CodeMirror = this;
    updateGutters(this);
    if (options.autofocus && !mobile) focusInput(this);

    this.state = {keyMaps: [],
                  overlays: [],
                  modeGen: 0,
                  overwrite: false, focused: false,
                  suppressEdits: false, pasteIncoming: false,
                  draggingText: false,
                  highlight: new Delayed()};

    themeChanged(this);
    if (options.lineWrapping)
      this.display.wrapper.className += " CodeMirror-wrap";

    var doc = options.value;
    if (typeof doc == "string") doc = new Doc(options.value, options.mode);
    operation(this, attachDoc)(this, doc);

    // Override magic textarea content restore that IE sometimes does
    // on our hidden textarea on reload
    if (ie) setTimeout(bind(resetInput, this, true), 20);

    registerEventHandlers(this);
    // IE throws unspecified error in certain cases, when
    // trying to access activeElement before onload
    var hasFocus; try { hasFocus = (document.activeElement == display.input); } catch(e) { }
    if (hasFocus || (options.autofocus && !mobile)) setTimeout(bind(onFocus, this), 20);
    else onBlur(this);

    operation(this, function() {
      for (var opt in optionHandlers)
        if (optionHandlers.propertyIsEnumerable(opt))
          optionHandlers[opt](this, options[opt], Init);
      for (var i = 0; i < initHooks.length; ++i) initHooks[i](this);
    })();
  }

  // DISPLAY CONSTRUCTOR

  function makeDisplay(place, docStart) {
    var d = {};
    var input = d.input = elt("textarea", null, null, "position: absolute; padding: 0; width: 1px; height: 1em; outline: none;");
    if (webkit) input.style.width = "1000px";
    else input.setAttribute("wrap", "off");
    input.setAttribute("autocorrect", "off"); input.setAttribute("autocapitalize", "off");
    // Wraps and hides input textarea
    d.inputDiv = elt("div", [input], null, "overflow: hidden; position: relative; width: 3px; height: 0px;");
    // The actual fake scrollbars.
    d.scrollbarH = elt("div", [elt("div", null, null, "height: 1px")], "CodeMirror-hscrollbar");
    d.scrollbarV = elt("div", [elt("div", null, null, "width: 1px")], "CodeMirror-vscrollbar");
    d.scrollbarFiller = elt("div", null, "CodeMirror-scrollbar-filler");
    // DIVs containing the selection and the actual code
    d.lineDiv = elt("div");
    d.selectionDiv = elt("div", null, null, "position: relative; z-index: 1");
    // Blinky cursor, and element used to ensure cursor fits at the end of a line
    d.cursor = elt("div", "\u00a0", "CodeMirror-cursor");
    // Secondary cursor, shown when on a 'jump' in bi-directional text
    d.otherCursor = elt("div", "\u00a0", "CodeMirror-cursor CodeMirror-secondarycursor");
    // Used to measure text size
    d.measure = elt("div", null, "CodeMirror-measure");
    // Wraps everything that needs to exist inside the vertically-padded coordinate system
    d.lineSpace = elt("div", [d.measure, d.selectionDiv, d.lineDiv, d.cursor, d.otherCursor],
                         null, "position: relative; outline: none");
    // Moved around its parent to cover visible view
    d.mover = elt("div", [elt("div", [d.lineSpace], "CodeMirror-lines")], null, "position: relative");
    // Set to the height of the text, causes scrolling
    d.sizer = elt("div", [d.mover], "CodeMirror-sizer");
    // D is needed because behavior of elts with overflow: auto and padding is inconsistent across browsers
    d.heightForcer = elt("div", null, null, "position: absolute; height: " + scrollerCutOff + "px");
    // Will contain the gutters, if any
    d.gutters = elt("div", null, "CodeMirror-gutters");
    d.lineGutter = null;
    // Helper element to properly size the gutter backgrounds
    var scrollerInner = elt("div", [d.sizer, d.heightForcer, d.gutters], null, "position: relative; min-height: 100%");
    // Provides scrolling
    d.scroller = elt("div", [scrollerInner], "CodeMirror-scroll");
    d.scroller.setAttribute("tabIndex", "-1");
    // The element in which the editor lives.
    d.wrapper = elt("div", [d.inputDiv, d.scrollbarH, d.scrollbarV,
                            d.scrollbarFiller, d.scroller], "CodeMirror");
    // Work around IE7 z-index bug
    if (ie_lt8) { d.gutters.style.zIndex = -1; d.scroller.style.paddingRight = 0; }
    if (place.appendChild) place.appendChild(d.wrapper); else place(d.wrapper);

    // Needed to hide big blue blinking cursor on Mobile Safari
    if (ios) input.style.width = "0px";
    if (!webkit) d.scroller.draggable = true;
    // Needed to handle Tab key in KHTML
    if (khtml) { d.inputDiv.style.height = "1px"; d.inputDiv.style.position = "absolute"; }
    // Need to set a minimum width to see the scrollbar on IE7 (but must not set it on IE8).
    else if (ie_lt8) d.scrollbarH.style.minWidth = d.scrollbarV.style.minWidth = "18px";

    // Current visible range (may be bigger than the view window).
    d.viewOffset = d.lastSizeC = 0;
    d.showingFrom = d.showingTo = docStart;

    // Used to only resize the line number gutter when necessary (when
    // the amount of lines crosses a boundary that makes its width change)
    d.lineNumWidth = d.lineNumInnerWidth = d.lineNumChars = null;
    // See readInput and resetInput
    d.prevInput = "";
    // Set to true when a non-horizontal-scrolling widget is added. As
    // an optimization, widget aligning is skipped when d is false.
    d.alignWidgets = false;
    // Flag that indicates whether we currently expect input to appear
    // (after some event like 'keypress' or 'input') and are polling
    // intensively.
    d.pollingFast = false;
    // Self-resetting timeout for the poller
    d.poll = new Delayed();
    // True when a drag from the editor is active
    d.draggingText = false;

    d.cachedCharWidth = d.cachedTextHeight = null;
    d.measureLineCache = [];
    d.measureLineCachePos = 0;

    // Tracks when resetInput has punted to just putting a short
    // string instead of the (large) selection.
    d.inaccurateSelection = false;

    // Tracks the maximum line length so that the horizontal scrollbar
    // can be kept static when scrolling.
    d.maxLine = null;
    d.maxLineLength = 0;
    d.maxLineChanged = false;

    // Used for measuring wheel scrolling granularity
    d.wheelDX = d.wheelDY = d.wheelStartX = d.wheelStartY = null;
    
    return d;
  }

  // STATE UPDATES

  // Used to get the editor into a consistent state again when options change.

  function loadMode(cm) {
    cm.doc.mode = CodeMirror.getMode(cm.options, cm.doc.modeOption);
    cm.doc.iter(function(line) {
      if (line.stateAfter) line.stateAfter = null;
      if (line.styles) line.styles = null;
    });
    cm.doc.frontier = cm.doc.first;
    startWorker(cm, 100);
    cm.state.modeGen++;
    if (cm.curOp) regChange(cm);
  }

  function wrappingChanged(cm) {
    if (cm.options.lineWrapping) {
      cm.display.wrapper.className += " CodeMirror-wrap";
      cm.display.sizer.style.minWidth = "";
    } else {
      cm.display.wrapper.className = cm.display.wrapper.className.replace(" CodeMirror-wrap", "");
      computeMaxLength(cm);
    }
    estimateLineHeights(cm);
    regChange(cm);
    clearCaches(cm);
    setTimeout(function(){updateScrollbars(cm.display, cm.doc.height);}, 100);
  }

  function estimateHeight(cm) {
    var th = textHeight(cm.display), wrapping = cm.options.lineWrapping;
    var perLine = wrapping && Math.max(5, cm.display.scroller.clientWidth / charWidth(cm.display) - 3);
    return function(line) {
      if (lineIsHidden(cm.doc, line))
        return 0;
      else if (wrapping)
        return (Math.ceil(line.text.length / perLine) || 1) * th;
      else
        return th;
    };
  }

  function estimateLineHeights(cm) {
    var doc = cm.doc, est = estimateHeight(cm);
    doc.iter(function(line) {
      var estHeight = est(line);
      if (estHeight != line.height) updateLineHeight(line, estHeight);
    });
  }

  function keyMapChanged(cm) {
    var style = keyMap[cm.options.keyMap].style;
    cm.display.wrapper.className = cm.display.wrapper.className.replace(/\s*cm-keymap-\S+/g, "") +
      (style ? " cm-keymap-" + style : "");
  }

  function themeChanged(cm) {
    cm.display.wrapper.className = cm.display.wrapper.className.replace(/\s*cm-s-\S+/g, "") +
      cm.options.theme.replace(/(^|\s)\s*/g, " cm-s-");
    clearCaches(cm);
  }

  function guttersChanged(cm) {
    updateGutters(cm);
    regChange(cm);
  }

  function updateGutters(cm) {
    var gutters = cm.display.gutters, specs = cm.options.gutters;
    removeChildren(gutters);
    for (var i = 0; i < specs.length; ++i) {
      var gutterClass = specs[i];
      var gElt = gutters.appendChild(elt("div", null, "CodeMirror-gutter " + gutterClass));
      if (gutterClass == "CodeMirror-linenumbers") {
        cm.display.lineGutter = gElt;
        gElt.style.width = (cm.display.lineNumWidth || 1) + "px";
      }
    }
    gutters.style.display = i ? "" : "none";
  }

  function lineLength(doc, line) {
    if (line.height == 0) return 0;
    var len = line.text.length, merged, cur = line;
    while (merged = collapsedSpanAtStart(cur)) {
      var found = merged.find();
      cur = getLine(doc, found.from.line);
      len += found.from.ch - found.to.ch;
    }
    cur = line;
    while (merged = collapsedSpanAtEnd(cur)) {
      var found = merged.find();
      len -= cur.text.length - found.from.ch;
      cur = getLine(doc, found.to.line);
      len += cur.text.length - found.to.ch;
    }
    return len;
  }

  function computeMaxLength(cm) {
    var d = cm.display, doc = cm.doc;
    d.maxLine = getLine(doc, doc.first);
    d.maxLineLength = lineLength(doc, d.maxLine);
    d.maxLineChanged = true;
    doc.iter(function(line) {
      var len = lineLength(doc, line);
      if (len > d.maxLineLength) {
        d.maxLineLength = len;
        d.maxLine = line;
      }
    });
  }

  // Make sure the gutters options contains the element
  // "CodeMirror-linenumbers" when the lineNumbers option is true.
  function setGuttersForLineNumbers(options) {
    var found = false;
    for (var i = 0; i < options.gutters.length; ++i) {
      if (options.gutters[i] == "CodeMirror-linenumbers") {
        if (options.lineNumbers) found = true;
        else options.gutters.splice(i--, 1);
      }
    }
    if (!found && options.lineNumbers)
      options.gutters.push("CodeMirror-linenumbers");
  }

  // SCROLLBARS

  // Re-synchronize the fake scrollbars with the actual size of the
  // content. Optionally force a scrollTop.
  function updateScrollbars(d /* display */, docHeight) {
    var totalHeight = docHeight + 2 * paddingTop(d);
    d.sizer.style.minHeight = d.heightForcer.style.top = totalHeight + "px";
    var scrollHeight = Math.max(totalHeight, d.scroller.scrollHeight);
    var needsH = d.scroller.scrollWidth > d.scroller.clientWidth;
    var needsV = scrollHeight > d.scroller.clientHeight;
    if (needsV) {
      d.scrollbarV.style.display = "block";
      d.scrollbarV.style.bottom = needsH ? scrollbarWidth(d.measure) + "px" : "0";
      d.scrollbarV.firstChild.style.height = 
        (scrollHeight - d.scroller.clientHeight + d.scrollbarV.clientHeight) + "px";
    } else d.scrollbarV.style.display = "";
    if (needsH) {
      d.scrollbarH.style.display = "block";
      d.scrollbarH.style.right = needsV ? scrollbarWidth(d.measure) + "px" : "0";
      d.scrollbarH.firstChild.style.width =
        (d.scroller.scrollWidth - d.scroller.clientWidth + d.scrollbarH.clientWidth) + "px";
    } else d.scrollbarH.style.display = "";
    if (needsH && needsV) {
      d.scrollbarFiller.style.display = "block";
      d.scrollbarFiller.style.height = d.scrollbarFiller.style.width = scrollbarWidth(d.measure) + "px";
    } else d.scrollbarFiller.style.display = "";

    if (mac_geLion && scrollbarWidth(d.measure) === 0)
      d.scrollbarV.style.minWidth = d.scrollbarH.style.minHeight = mac_geMountainLion ? "18px" : "12px";
  }

  function visibleLines(display, doc, viewPort) {
    var top = display.scroller.scrollTop, height = display.wrapper.clientHeight;
    if (typeof viewPort == "number") top = viewPort;
    else if (viewPort) {top = viewPort.top; height = viewPort.bottom - viewPort.top;}
    top = Math.floor(top - paddingTop(display));
    var bottom = Math.ceil(top + height);
    return {from: lineAtHeight(doc, top), to: lineAtHeight(doc, bottom)};
  }

  // LINE NUMBERS

  function alignHorizontally(cm) {
    var display = cm.display;
    if (!display.alignWidgets && (!display.gutters.firstChild || !cm.options.fixedGutter)) return;
    var comp = compensateForHScroll(display) - display.scroller.scrollLeft + cm.doc.scrollLeft;
    var gutterW = display.gutters.offsetWidth, l = comp + "px";
    for (var n = display.lineDiv.firstChild; n; n = n.nextSibling) if (n.alignable) {
      for (var i = 0, a = n.alignable; i < a.length; ++i) a[i].style.left = l;
    }
    if (cm.options.fixedGutter)
      display.gutters.style.left = (comp + gutterW) + "px";
  }

  function maybeUpdateLineNumberWidth(cm) {
    if (!cm.options.lineNumbers) return false;
    var doc = cm.doc, last = lineNumberFor(cm.options, doc.first + doc.size - 1), display = cm.display;
    if (last.length != display.lineNumChars) {
      var test = display.measure.appendChild(elt("div", [elt("div", last)],
                                                 "CodeMirror-linenumber CodeMirror-gutter-elt"));
      var innerW = test.firstChild.offsetWidth, padding = test.offsetWidth - innerW;
      display.lineGutter.style.width = "";
      display.lineNumInnerWidth = Math.max(innerW, display.lineGutter.offsetWidth - padding);
      display.lineNumWidth = display.lineNumInnerWidth + padding;
      display.lineNumChars = display.lineNumInnerWidth ? last.length : -1;
      display.lineGutter.style.width = display.lineNumWidth + "px";
      return true;
    }
    return false;
  }

  function lineNumberFor(options, i) {
    return String(options.lineNumberFormatter(i + options.firstLineNumber));
  }
  function compensateForHScroll(display) {
    return getRect(display.scroller).left - getRect(display.sizer).left;
  }

  // DISPLAY DRAWING

  function updateDisplay(cm, changes, viewPort) {
    var oldFrom = cm.display.showingFrom, oldTo = cm.display.showingTo;
    var updated = updateDisplayInner(cm, changes, viewPort);
    if (updated) {
      signalLater(cm, "update", cm);
      if (cm.display.showingFrom != oldFrom || cm.display.showingTo != oldTo)
        signalLater(cm, "viewportChange", cm, cm.display.showingFrom, cm.display.showingTo);
    }
    updateSelection(cm);
    updateScrollbars(cm.display, cm.doc.height);

    return updated;
  }

  // Uses a set of changes plus the current scroll position to
  // determine which DOM updates have to be made, and makes the
  // updates.
  function updateDisplayInner(cm, changes, viewPort) {
    var display = cm.display, doc = cm.doc;
    if (!display.wrapper.clientWidth) {
      display.showingFrom = display.showingTo = doc.first;
      display.viewOffset = 0;
      return;
    }

    // Compute the new visible window
    // If scrollTop is specified, use that to determine which lines
    // to render instead of the current scrollbar position.
    var visible = visibleLines(display, doc, viewPort);
    // Bail out if the visible area is already rendered and nothing changed.
    if (changes.length == 0 &&
        visible.from > display.showingFrom && visible.to < display.showingTo)
      return;

    if (maybeUpdateLineNumberWidth(cm))
      changes = [{from: doc.first, to: doc.first + doc.size}];
    var gutterW = display.sizer.style.marginLeft = display.gutters.offsetWidth + "px";
    display.scrollbarH.style.left = cm.options.fixedGutter ? gutterW : "0";

    // Used to determine which lines need their line numbers updated
    var positionsChangedFrom = Infinity;
    if (cm.options.lineNumbers)
      for (var i = 0; i < changes.length; ++i)
        if (changes[i].diff) { positionsChangedFrom = changes[i].from; break; }

    var end = doc.first + doc.size;
    var from = Math.max(visible.from - cm.options.viewportMargin, doc.first);
    var to = Math.min(end, visible.to + cm.options.viewportMargin);
    if (display.showingFrom < from && from - display.showingFrom < 20) from = Math.max(doc.first, display.showingFrom);
    if (display.showingTo > to && display.showingTo - to < 20) to = Math.min(end, display.showingTo);
    if (sawCollapsedSpans) {
      from = lineNo(visualLine(doc, getLine(doc, from)));
      while (to < end && lineIsHidden(doc, getLine(doc, to))) ++to;
    }

    // Create a range of theoretically intact lines, and punch holes
    // in that using the change info.
    var intact = [{from: Math.max(display.showingFrom, doc.first),
                   to: Math.min(display.showingTo, end)}];
    if (intact[0].from >= intact[0].to) intact = [];
    else intact = computeIntact(intact, changes);
    // When merged lines are present, we might have to reduce the
    // intact ranges because changes in continued fragments of the
    // intact lines do require the lines to be redrawn.
    if (sawCollapsedSpans)
      for (var i = 0; i < intact.length; ++i) {
        var range = intact[i], merged;
        while (merged = collapsedSpanAtEnd(getLine(doc, range.to - 1))) {
          var newTo = merged.find().from.line;
          if (newTo > range.from) range.to = newTo;
          else { intact.splice(i--, 1); break; }
        }
      }

    // Clip off the parts that won't be visible
    var intactLines = 0;
    for (var i = 0; i < intact.length; ++i) {
      var range = intact[i];
      if (range.from < from) range.from = from;
      if (range.to > to) range.to = to;
      if (range.from >= range.to) intact.splice(i--, 1);
      else intactLines += range.to - range.from;
    }
    if (intactLines == to - from && from == display.showingFrom && to == display.showingTo) {
      updateViewOffset(cm);
      return;
    }
    intact.sort(function(a, b) {return a.from - b.from;});

    var focused = document.activeElement;
    if (intactLines < (to - from) * .7) display.lineDiv.style.display = "none";
    patchDisplay(cm, from, to, intact, positionsChangedFrom);
    display.lineDiv.style.display = "";
    if (document.activeElement != focused && focused.offsetHeight) focused.focus();

    var different = from != display.showingFrom || to != display.showingTo ||
      display.lastSizeC != display.wrapper.clientHeight;
    // This is just a bogus formula that detects when the editor is
    // resized or the font size changes.
    if (different) display.lastSizeC = display.wrapper.clientHeight;
    display.showingFrom = from; display.showingTo = to;
    startWorker(cm, 100);

    var prevBottom = display.lineDiv.offsetTop;
    for (var node = display.lineDiv.firstChild, height; node; node = node.nextSibling) if (node.lineObj) {
      if (ie_lt8) {
        var bot = node.offsetTop + node.offsetHeight;
        height = bot - prevBottom;
        prevBottom = bot;
      } else {
        var box = getRect(node);
        height = box.bottom - box.top;
      }
      var diff = node.lineObj.height - height;
      if (height < 2) height = textHeight(display);
      if (diff > .001 || diff < -.001) {
        updateLineHeight(node.lineObj, height);
        var widgets = node.lineObj.widgets;
        if (widgets) for (var i = 0; i < widgets.length; ++i)
          widgets[i].height = widgets[i].node.offsetHeight;
      }
    }
    updateViewOffset(cm);

    if (visibleLines(display, doc, viewPort).to > to)
      updateDisplayInner(cm, [], viewPort);
    return true;
  }

  function updateViewOffset(cm) {
    var off = cm.display.viewOffset = heightAtLine(cm, getLine(cm.doc, cm.display.showingFrom));
    // Position the mover div to align with the current virtual scroll position
    cm.display.mover.style.top = off + "px";
  }

  function computeIntact(intact, changes) {
    for (var i = 0, l = changes.length || 0; i < l; ++i) {
      var change = changes[i], intact2 = [], diff = change.diff || 0;
      for (var j = 0, l2 = intact.length; j < l2; ++j) {
        var range = intact[j];
        if (change.to <= range.from && change.diff) {
          intact2.push({from: range.from + diff, to: range.to + diff});
        } else if (change.to <= range.from || change.from >= range.to) {
          intact2.push(range);
        } else {
          if (change.from > range.from)
            intact2.push({from: range.from, to: change.from});
          if (change.to < range.to)
            intact2.push({from: change.to + diff, to: range.to + diff});
        }
      }
      intact = intact2;
    }
    return intact;
  }

  function getDimensions(cm) {
    var d = cm.display, left = {}, width = {};
    for (var n = d.gutters.firstChild, i = 0; n; n = n.nextSibling, ++i) {
      left[cm.options.gutters[i]] = n.offsetLeft;
      width[cm.options.gutters[i]] = n.offsetWidth;
    }
    return {fixedPos: compensateForHScroll(d),
            gutterTotalWidth: d.gutters.offsetWidth,
            gutterLeft: left,
            gutterWidth: width,
            wrapperWidth: d.wrapper.clientWidth};
  }

  function patchDisplay(cm, from, to, intact, updateNumbersFrom) {
    var dims = getDimensions(cm);
    var display = cm.display, lineNumbers = cm.options.lineNumbers;
    if (!intact.length && (!webkit || !cm.display.currentWheelTarget))
      removeChildren(display.lineDiv);
    var container = display.lineDiv, cur = container.firstChild;

    function rm(node) {
      var next = node.nextSibling;
      if (webkit && mac && cm.display.currentWheelTarget == node) {
        node.style.display = "none";
        node.lineObj = null;
      } else {
        node.parentNode.removeChild(node);
      }
      return next;
    }

    var nextIntact = intact.shift(), lineN = from;
    cm.doc.iter(from, to, function(line) {
      if (nextIntact && nextIntact.to == lineN) nextIntact = intact.shift();
      if (lineIsHidden(cm.doc, line)) {
        if (line.height != 0) updateLineHeight(line, 0);
        if (line.widgets && cur.previousSibling) for (var i = 0; i < line.widgets.length; ++i)
          if (line.widgets[i].showIfHidden) {
            var prev = cur.previousSibling;
            if (/pre/i.test(prev.nodeName)) {
              var wrap = elt("div", null, null, "position: relative");
              prev.parentNode.replaceChild(wrap, prev);
              wrap.appendChild(prev);
              prev = wrap;
            }
            var wnode = prev.appendChild(elt("div", [line.widgets[i].node], "CodeMirror-linewidget"));
            positionLineWidget(line.widgets[i], wnode, prev, dims);
          }
      } else if (nextIntact && nextIntact.from <= lineN && nextIntact.to > lineN) {
        // This line is intact. Skip to the actual node. Update its
        // line number if needed.
        while (cur.lineObj != line) cur = rm(cur);
        if (lineNumbers && updateNumbersFrom <= lineN && cur.lineNumber)
          setTextContent(cur.lineNumber, lineNumberFor(cm.options, lineN));
        cur = cur.nextSibling;
      } else {
        // For lines with widgets, make an attempt to find and reuse
        // the existing element, so that widgets aren't needlessly
        // removed and re-inserted into the dom
        if (line.widgets) for (var j = 0, search = cur, reuse; search && j < 20; ++j, search = search.nextSibling)
          if (search.lineObj == line && /div/i.test(search.nodeName)) { reuse = search; break; }
        // This line needs to be generated.
        var lineNode = buildLineElement(cm, line, lineN, dims, reuse);
        if (lineNode != reuse) {
          container.insertBefore(lineNode, cur);
        } else {
          while (cur != reuse) cur = rm(cur);
          cur = cur.nextSibling;
        }

        lineNode.lineObj = line;
      }
      ++lineN;
    });
    while (cur) cur = rm(cur);
  }

  function buildLineElement(cm, line, lineNo, dims, reuse) {
    var lineElement = lineContent(cm, line);
    var markers = line.gutterMarkers, display = cm.display, wrap;

    if (!cm.options.lineNumbers && !markers && !line.bgClass && !line.wrapClass && !line.widgets)
      return lineElement;

    // Lines with gutter elements, widgets or a background class need
    // to be wrapped again, and have the extra elements added to the
    // wrapper div
    
    if (reuse) {
      reuse.alignable = null;
      var isOk = true, widgetsSeen = 0;
      for (var n = reuse.firstChild, next; n; n = next) {
        next = n.nextSibling;
        if (!/\bCodeMirror-linewidget\b/.test(n.className)) {
          reuse.removeChild(n);
        } else {
          for (var i = 0, first = true; i < line.widgets.length; ++i) {
            var widget = line.widgets[i], isFirst = false;
            if (!widget.above) { isFirst = first; first = false; }
            if (widget.node == n.firstChild) {
              positionLineWidget(widget, n, reuse, dims);
              ++widgetsSeen;
              if (isFirst) reuse.insertBefore(lineElement, n);
              break;
            }
          }
          if (i == line.widgets.length) { isOk = false; break; }
        }
      }
      if (isOk && widgetsSeen == line.widgets.length) {
        wrap = reuse;
        reuse.className = line.wrapClass || "";
      }
    }
    if (!wrap) {
      wrap = elt("div", null, line.wrapClass, "position: relative");
      wrap.appendChild(lineElement);
    }
    // Kludge to make sure the styled element lies behind the selection (by z-index)
    if (line.bgClass)
      wrap.insertBefore(elt("div", null, line.bgClass + " CodeMirror-linebackground"), wrap.firstChild);
    if (cm.options.lineNumbers || markers) {
      var gutterWrap = wrap.insertBefore(elt("div", null, null, "position: absolute; left: " +
                                             (cm.options.fixedGutter ? dims.fixedPos : -dims.gutterTotalWidth) + "px"),
                                         wrap.firstChild);
      if (cm.options.fixedGutter) (wrap.alignable || (wrap.alignable = [])).push(gutterWrap);
      if (cm.options.lineNumbers && (!markers || !markers["CodeMirror-linenumbers"]))
        wrap.lineNumber = gutterWrap.appendChild(
          elt("div", lineNumberFor(cm.options, lineNo),
              "CodeMirror-linenumber CodeMirror-gutter-elt",
              "left: " + dims.gutterLeft["CodeMirror-linenumbers"] + "px; width: "
              + display.lineNumInnerWidth + "px"));
      if (markers)
        for (var k = 0; k < cm.options.gutters.length; ++k) {
          var id = cm.options.gutters[k], found = markers.hasOwnProperty(id) && markers[id];
          if (found)
            gutterWrap.appendChild(elt("div", [found], "CodeMirror-gutter-elt", "left: " +
                                       dims.gutterLeft[id] + "px; width: " + dims.gutterWidth[id] + "px"));
        }
    }
    if (ie_lt8) wrap.style.zIndex = 2;
    if (line.widgets && wrap != reuse) for (var i = 0, ws = line.widgets; i < ws.length; ++i) {
      var widget = ws[i], node = elt("div", [widget.node], "CodeMirror-linewidget");
      positionLineWidget(widget, node, wrap, dims);
      if (widget.above)
        wrap.insertBefore(node, cm.options.lineNumbers && line.height != 0 ? gutterWrap : lineElement);
      else
        wrap.appendChild(node);
      signalLater(widget, "redraw");
    }
    return wrap;
  }

  function positionLineWidget(widget, node, wrap, dims) {
    if (widget.noHScroll) {
      (wrap.alignable || (wrap.alignable = [])).push(node);
      var width = dims.wrapperWidth;
      node.style.left = dims.fixedPos + "px";
      if (!widget.coverGutter) {
        width -= dims.gutterTotalWidth;
        node.style.paddingLeft = dims.gutterTotalWidth + "px";
      }
      node.style.width = width + "px";
    }
    if (widget.coverGutter) {
      node.style.zIndex = 5;
      node.style.position = "relative";
      if (!widget.noHScroll) node.style.marginLeft = -dims.gutterTotalWidth + "px";
    }
  }

  // SELECTION / CURSOR

  function updateSelection(cm) {
    var display = cm.display;
    var collapsed = posEq(cm.doc.sel.from, cm.doc.sel.to);
    if (collapsed || cm.options.showCursorWhenSelecting)
      updateSelectionCursor(cm);
    else
      display.cursor.style.display = display.otherCursor.style.display = "none";
    if (!collapsed)
      updateSelectionRange(cm);
    else
      display.selectionDiv.style.display = "none";

    // Move the hidden textarea near the cursor to prevent scrolling artifacts
    var headPos = cursorCoords(cm, cm.doc.sel.head, "div");
    var wrapOff = getRect(display.wrapper), lineOff = getRect(display.lineDiv);
    display.inputDiv.style.top = Math.max(0, Math.min(display.wrapper.clientHeight - 10,
                                                      headPos.top + lineOff.top - wrapOff.top)) + "px";
    display.inputDiv.style.left = Math.max(0, Math.min(display.wrapper.clientWidth - 10,
                                                       headPos.left + lineOff.left - wrapOff.left)) + "px";
  }

  // No selection, plain cursor
  function updateSelectionCursor(cm) {
    var display = cm.display, pos = cursorCoords(cm, cm.doc.sel.head, "div");
    display.cursor.style.left = pos.left + "px";
    display.cursor.style.top = pos.top + "px";
    display.cursor.style.height = Math.max(0, pos.bottom - pos.top) * cm.options.cursorHeight + "px";
    display.cursor.style.display = "";

    if (pos.other) {
      display.otherCursor.style.display = "";
      display.otherCursor.style.left = pos.other.left + "px";
      display.otherCursor.style.top = pos.other.top + "px";
      display.otherCursor.style.height = (pos.other.bottom - pos.other.top) * .85 + "px";
    } else { display.otherCursor.style.display = "none"; }
  }

  // Highlight selection
  function updateSelectionRange(cm) {
    var display = cm.display, doc = cm.doc, sel = cm.doc.sel;
    var fragment = document.createDocumentFragment();
    var clientWidth = display.lineSpace.offsetWidth, pl = paddingLeft(cm.display);

    function add(left, top, width, bottom) {
      if (top < 0) top = 0;
      fragment.appendChild(elt("div", null, "CodeMirror-selected", "position: absolute; left: " + left +
                               "px; top: " + top + "px; width: " + (width == null ? clientWidth - left : width) +
                               "px; height: " + (bottom - top) + "px"));
    }

    function drawForLine(line, fromArg, toArg, retTop) {
      var lineObj = getLine(doc, line);
      var lineLen = lineObj.text.length, rVal = retTop ? Infinity : -Infinity;
      function coords(ch) {
        return charCoords(cm, Pos(line, ch), "div", lineObj);
      }

      iterateBidiSections(getOrder(lineObj), fromArg || 0, toArg == null ? lineLen : toArg, function(from, to, dir) {
        var leftPos = coords(dir == "rtl" ? to - 1 : from);
        var rightPos = coords(dir == "rtl" ? from : to - 1);
        var left = leftPos.left, right = rightPos.right;
        if (rightPos.top - leftPos.top > 3) { // Different lines, draw top part
          add(left, leftPos.top, null, leftPos.bottom);
          left = pl;
          if (leftPos.bottom < rightPos.top) add(left, leftPos.bottom, null, rightPos.top);
        }
        if (toArg == null && to == lineLen) right = clientWidth;
        if (fromArg == null && from == 0) left = pl;
        rVal = retTop ? Math.min(rightPos.top, rVal) : Math.max(rightPos.bottom, rVal);
        if (left < pl + 1) left = pl;
        add(left, rightPos.top, right - left, rightPos.bottom);
      });
      return rVal;
    }

    if (sel.from.line == sel.to.line) {
      drawForLine(sel.from.line, sel.from.ch, sel.to.ch);
    } else {
      var fromObj = getLine(doc, sel.from.line);
      var cur = fromObj, merged, path = [sel.from.line, sel.from.ch], singleLine;
      while (merged = collapsedSpanAtEnd(cur)) {
        var found = merged.find();
        path.push(found.from.ch, found.to.line, found.to.ch);
        if (found.to.line == sel.to.line) {
          path.push(sel.to.ch);
          singleLine = true;
          break;
        }
        cur = getLine(doc, found.to.line);
      }

      // This is a single, merged line
      if (singleLine) {
        for (var i = 0; i < path.length; i += 3)
          drawForLine(path[i], path[i+1], path[i+2]);
      } else {
        var middleTop, middleBot, toObj = getLine(doc, sel.to.line);
        if (sel.from.ch)
          // Draw the first line of selection.
          middleTop = drawForLine(sel.from.line, sel.from.ch, null, false);
        else
          // Simply include it in the middle block.
          middleTop = heightAtLine(cm, fromObj) - display.viewOffset;

        if (!sel.to.ch)
          middleBot = heightAtLine(cm, toObj) - display.viewOffset;
        else
          middleBot = drawForLine(sel.to.line, collapsedSpanAtStart(toObj) ? null : 0, sel.to.ch, true);

        if (middleTop < middleBot) add(pl, middleTop, null, middleBot);
      }
    }

    removeChildrenAndAdd(display.selectionDiv, fragment);
    display.selectionDiv.style.display = "";
  }

  // Cursor-blinking
  function restartBlink(cm) {
    var display = cm.display;
    clearInterval(display.blinker);
    var on = true;
    display.cursor.style.visibility = display.otherCursor.style.visibility = "";
    display.blinker = setInterval(function() {
      if (!display.cursor.offsetHeight) return;
      display.cursor.style.visibility = display.otherCursor.style.visibility = (on = !on) ? "" : "hidden";
    }, cm.options.cursorBlinkRate);
  }

  // HIGHLIGHT WORKER

  function startWorker(cm, time) {
    if (cm.doc.mode.startState && cm.doc.frontier < cm.display.showingTo)
      cm.state.highlight.set(time, bind(highlightWorker, cm));
  }

  function highlightWorker(cm) {
    var doc = cm.doc;
    if (doc.frontier < doc.first) doc.frontier = doc.first;
    if (doc.frontier >= cm.display.showingTo) return;
    var end = +new Date + cm.options.workTime;
    var state = copyState(doc.mode, getStateBefore(cm, doc.frontier));
    var changed = [], prevChange;
    doc.iter(doc.frontier, Math.min(doc.first + doc.size, cm.display.showingTo + 500), function(line) {
      if (doc.frontier >= cm.display.showingFrom) { // Visible
        var oldStyles = line.styles;
        line.styles = highlightLine(cm, line, state);
        var ischange = !oldStyles || oldStyles.length != line.styles.length;
        for (var i = 0; !ischange && i < oldStyles.length; ++i) ischange = oldStyles[i] != line.styles[i];
        if (ischange) {
          if (prevChange && prevChange.end == doc.frontier) prevChange.end++;
          else changed.push(prevChange = {start: doc.frontier, end: doc.frontier + 1});
        }
        line.stateAfter = copyState(doc.mode, state);
      } else {
        processLine(cm, line, state);
        line.stateAfter = doc.frontier % 5 == 0 ? copyState(doc.mode, state) : null;
      }
      ++doc.frontier;
      if (+new Date > end) {
        startWorker(cm, cm.options.workDelay);
        return true;
      }
    });
    if (changed.length)
      operation(cm, function() {
        for (var i = 0; i < changed.length; ++i)
          regChange(this, changed[i].start, changed[i].end);
      })();
  }

  // Finds the line to start with when starting a parse. Tries to
  // find a line with a stateAfter, so that it can start with a
  // valid state. If that fails, it returns the line with the
  // smallest indentation, which tends to need the least context to
  // parse correctly.
  function findStartLine(cm, n) {
    var minindent, minline, doc = cm.doc;
    for (var search = n, lim = n - 100; search > lim; --search) {
      if (search <= doc.first) return doc.first;
      var line = getLine(doc, search - 1);
      if (line.stateAfter) return search;
      var indented = countColumn(line.text, null, cm.options.tabSize);
      if (minline == null || minindent > indented) {
        minline = search - 1;
        minindent = indented;
      }
    }
    return minline;
  }

  function getStateBefore(cm, n) {
    var doc = cm.doc, display = cm.display;
      if (!doc.mode.startState) return true;
    var pos = findStartLine(cm, n), state = pos > doc.first && getLine(doc, pos-1).stateAfter;
    if (!state) state = startState(doc.mode);
    else state = copyState(doc.mode, state);
    doc.iter(pos, n, function(line) {
      processLine(cm, line, state);
      var save = pos == n - 1 || pos % 5 == 0 || pos >= display.showingFrom && pos < display.showingTo;
      line.stateAfter = save ? copyState(doc.mode, state) : null;
      ++pos;
    });
    return state;
  }

  // POSITION MEASUREMENT
  
  function paddingTop(display) {return display.lineSpace.offsetTop;}
  function paddingLeft(display) {
    var e = removeChildrenAndAdd(display.measure, elt("pre", null, null, "text-align: left")).appendChild(elt("span", "x"));
    return e.offsetLeft;
  }

  function measureChar(cm, line, ch, data) {
    var dir = -1;
    data = data || measureLine(cm, line);
    
    for (var pos = ch;; pos += dir) {
      var r = data[pos];
      if (r) break;
      if (dir < 0 && pos == 0) dir = 1;
    }
    return {left: pos < ch ? r.right : r.left,
            right: pos > ch ? r.left : r.right,
            top: r.top, bottom: r.bottom};
  }

  function findCachedMeasurement(cm, line) {
    var cache = cm.display.measureLineCache;
    for (var i = 0; i < cache.length; ++i) {
      var memo = cache[i];
      if (memo.text == line.text && memo.markedSpans == line.markedSpans &&
          cm.display.scroller.clientWidth == memo.width &&
          memo.classes == line.textClass + "|" + line.bgClass + "|" + line.wrapClass)
        return memo.measure;
    }
  }

  function measureLine(cm, line) {
    // First look in the cache
    var measure = findCachedMeasurement(cm, line);
    if (!measure) {
      // Failing that, recompute and store result in cache
      measure = measureLineInner(cm, line);
      var cache = cm.display.measureLineCache;
      var memo = {text: line.text, width: cm.display.scroller.clientWidth,
                  markedSpans: line.markedSpans, measure: measure,
                  classes: line.textClass + "|" + line.bgClass + "|" + line.wrapClass};
      if (cache.length == 16) cache[++cm.display.measureLineCachePos % 16] = memo;
      else cache.push(memo);
    }
    return measure;
  }

  function measureLineInner(cm, line) {
    var display = cm.display, measure = emptyArray(line.text.length);
    var pre = lineContent(cm, line, measure);

    // IE does not cache element positions of inline elements between
    // calls to getBoundingClientRect. This makes the loop below,
    // which gathers the positions of all the characters on the line,
    // do an amount of layout work quadratic to the number of
    // characters. When line wrapping is off, we try to improve things
    // by first subdividing the line into a bunch of inline blocks, so
    // that IE can reuse most of the layout information from caches
    // for those blocks. This does interfere with line wrapping, so it
    // doesn't work when wrapping is on, but in that case the
    // situation is slightly better, since IE does cache line-wrapping
    // information and only recomputes per-line.
    if (ie && !ie_lt8 && !cm.options.lineWrapping && pre.childNodes.length > 100) {
      var fragment = document.createDocumentFragment();
      var chunk = 10, n = pre.childNodes.length;
      for (var i = 0, chunks = Math.ceil(n / chunk); i < chunks; ++i) {
        var wrap = elt("div", null, null, "display: inline-block");
        for (var j = 0; j < chunk && n; ++j) {
          wrap.appendChild(pre.firstChild);
          --n;
        }
        fragment.appendChild(wrap);
      }
      pre.appendChild(fragment);
    }

    removeChildrenAndAdd(display.measure, pre);

    var outer = getRect(display.lineDiv);
    var vranges = [], data = emptyArray(line.text.length), maxBot = pre.offsetHeight;
    // Work around an IE7/8 bug where it will sometimes have randomly
    // replaced our pre with a clone at this point.
    if (ie_lt9 && display.measure.first != pre)
      removeChildrenAndAdd(display.measure, pre);

    for (var i = 0, cur; i < measure.length; ++i) if (cur = measure[i]) {
      var size = getRect(cur);
      var top = Math.max(0, size.top - outer.top), bot = Math.min(size.bottom - outer.top, maxBot);
      for (var j = 0; j < vranges.length; j += 2) {
        var rtop = vranges[j], rbot = vranges[j+1];
        if (rtop > bot || rbot < top) continue;
        if (rtop <= top && rbot >= bot ||
            top <= rtop && bot >= rbot ||
            Math.min(bot, rbot) - Math.max(top, rtop) >= (bot - top) >> 1) {
          vranges[j] = Math.min(top, rtop);
          vranges[j+1] = Math.max(bot, rbot);
          break;
        }
      }
      if (j == vranges.length) vranges.push(top, bot);
      var right = size.right;
      if (cur.measureRight) right = getRect(cur.measureRight).left;
      data[i] = {left: size.left - outer.left, right: right - outer.left, top: j};
    }
    for (var i = 0, cur; i < data.length; ++i) if (cur = data[i]) {
      var vr = cur.top;
      cur.top = vranges[vr]; cur.bottom = vranges[vr+1];
    }

    return data;
  }

  function measureLineWidth(cm, line) {
    var hasBadSpan = false;
    if (line.markedSpans) for (var i = 0; i < line.markedSpans; ++i) {
      var sp = line.markedSpans[i];
      if (sp.collapsed && (sp.to == null || sp.to == line.text.length)) hasBadSpan = true;
    }
    var cached = !hasBadSpan && findCachedMeasurement(cm, line);
    if (cached) return measureChar(cm, line, line.text.length, cached).right;

    var pre = lineContent(cm, line);
    var end = pre.appendChild(zeroWidthElement(cm.display.measure));
    removeChildrenAndAdd(cm.display.measure, pre);
    return getRect(end).right - getRect(cm.display.lineDiv).left;
  }

  function clearCaches(cm) {
    cm.display.measureLineCache.length = cm.display.measureLineCachePos = 0;
    cm.display.cachedCharWidth = cm.display.cachedTextHeight = null;
    cm.display.maxLineChanged = true;
    cm.display.lineNumChars = null;
  }

  // Context is one of "line", "div" (display.lineDiv), "local"/null (editor), or "page"
  function intoCoordSystem(cm, lineObj, rect, context) {
    if (lineObj.widgets) for (var i = 0; i < lineObj.widgets.length; ++i) if (lineObj.widgets[i].above) {
      var size = widgetHeight(lineObj.widgets[i]);
      rect.top += size; rect.bottom += size;
    }
    if (context == "line") return rect;
    if (!context) context = "local";
    var yOff = heightAtLine(cm, lineObj);
    if (context != "local") yOff -= cm.display.viewOffset;
    if (context == "page") {
      var lOff = getRect(cm.display.lineSpace);
      yOff += lOff.top + (window.pageYOffset || (document.documentElement || document.body).scrollTop);
      var xOff = lOff.left + (window.pageXOffset || (document.documentElement || document.body).scrollLeft);
      rect.left += xOff; rect.right += xOff;
    }
    rect.top += yOff; rect.bottom += yOff;
    return rect;
  }

  function charCoords(cm, pos, context, lineObj) {
    if (!lineObj) lineObj = getLine(cm.doc, pos.line);
    return intoCoordSystem(cm, lineObj, measureChar(cm, lineObj, pos.ch), context);
  }

  function cursorCoords(cm, pos, context, lineObj, measurement) {
    lineObj = lineObj || getLine(cm.doc, pos.line);
    if (!measurement) measurement = measureLine(cm, lineObj);
    function get(ch, right) {
      var m = measureChar(cm, lineObj, ch, measurement);
      if (right) m.left = m.right; else m.right = m.left;
      return intoCoordSystem(cm, lineObj, m, context);
    }
    var order = getOrder(lineObj), ch = pos.ch;
    if (!order) return get(ch);
    var main, other, linedir = order[0].level;
    for (var i = 0; i < order.length; ++i) {
      var part = order[i], rtl = part.level % 2, nb, here;
      if (part.from < ch && part.to > ch) return get(ch, rtl);
      var left = rtl ? part.to : part.from, right = rtl ? part.from : part.to;
      if (left == ch) {
        // IE returns bogus offsets and widths for edges where the
        // direction flips, but only for the side with the lower
        // level. So we try to use the side with the higher level.
        if (i && part.level < (nb = order[i-1]).level) here = get(nb.level % 2 ? nb.from : nb.to - 1, true);
        else here = get(rtl && part.from != part.to ? ch - 1 : ch);
        if (rtl == linedir) main = here; else other = here;
      } else if (right == ch) {
        var nb = i < order.length - 1 && order[i+1];
        if (!rtl && nb && nb.from == nb.to) continue;
        if (nb && part.level < nb.level) here = get(nb.level % 2 ? nb.to - 1 : nb.from);
        else here = get(rtl ? ch : ch - 1, true);
        if (rtl == linedir) main = here; else other = here;
      }
    }
    if (linedir && !ch) other = get(order[0].to - 1);
    if (!main) return other;
    if (other) main.other = other;
    return main;
  }

  function PosMaybeOutside(line, ch, outside) {
    var pos = new Pos(line, ch);
    if (outside) pos.outside = true;
    return pos;
  }

  // Coords must be lineSpace-local
  function coordsChar(cm, x, y) {
    var doc = cm.doc;
    y += cm.display.viewOffset;
    if (y < 0) return PosMaybeOutside(doc.first, 0, true);
    var lineNo = lineAtHeight(doc, y), last = doc.first + doc.size - 1;
    if (lineNo > last)
      return PosMaybeOutside(doc.first + doc.size - 1, getLine(doc, last).text.length, true);
    if (x < 0) x = 0;

    for (;;) {
      var lineObj = getLine(doc, lineNo);
      var found = coordsCharInner(cm, lineObj, lineNo, x, y);
      var merged = collapsedSpanAtEnd(lineObj);
      var mergedPos = merged && merged.find();
      if (merged && found.ch >= mergedPos.from.ch)
        lineNo = mergedPos.to.line;
      else
        return found;
    }
  }

  function coordsCharInner(cm, lineObj, lineNo, x, y) {
    var innerOff = y - heightAtLine(cm, lineObj);
    var wrongLine = false, cWidth = cm.display.wrapper.clientWidth;
    var measurement = measureLine(cm, lineObj);

    function getX(ch) {
      var sp = cursorCoords(cm, Pos(lineNo, ch), "line",
                            lineObj, measurement);
      wrongLine = true;
      if (innerOff > sp.bottom) return Math.max(0, sp.left - cWidth);
      else if (innerOff < sp.top) return sp.left + cWidth;
      else wrongLine = false;
      return sp.left;
    }

    var bidi = getOrder(lineObj), dist = lineObj.text.length;
    var from = lineLeft(lineObj), to = lineRight(lineObj);
    var fromX = getX(from), fromOutside = wrongLine, toX = getX(to), toOutside = wrongLine;

    if (x > toX) return PosMaybeOutside(lineNo, to, toOutside);
    // Do a binary search between these bounds.
    for (;;) {
      if (bidi ? to == from || to == moveVisually(lineObj, from, 1) : to - from <= 1) {
        var after = x - fromX < toX - x, ch = after ? from : to;
        while (isExtendingChar.test(lineObj.text.charAt(ch))) ++ch;
        var pos = PosMaybeOutside(lineNo, ch, after ? fromOutside : toOutside);
        pos.after = after;
        return pos;
      }
      var step = Math.ceil(dist / 2), middle = from + step;
      if (bidi) {
        middle = from;
        for (var i = 0; i < step; ++i) middle = moveVisually(lineObj, middle, 1);
      }
      var middleX = getX(middle);
      if (middleX > x) {to = middle; toX = middleX; if (toOutside = wrongLine) toX += 1000; dist -= step;}
      else {from = middle; fromX = middleX; fromOutside = wrongLine; dist = step;}
    }
  }

  var measureText;
  function textHeight(display) {
    if (display.cachedTextHeight != null) return display.cachedTextHeight;
    if (measureText == null) {
      measureText = elt("pre");
      // Measure a bunch of lines, for browsers that compute
      // fractional heights.
      for (var i = 0; i < 49; ++i) {
        measureText.appendChild(document.createTextNode("x"));
        measureText.appendChild(elt("br"));
      }
      measureText.appendChild(document.createTextNode("x"));
    }
    removeChildrenAndAdd(display.measure, measureText);
    var height = measureText.offsetHeight / 50;
    if (height > 3) display.cachedTextHeight = height;
    removeChildren(display.measure);
    return height || 1;
  }

  function charWidth(display) {
    if (display.cachedCharWidth != null) return display.cachedCharWidth;
    var anchor = elt("span", "x");
    var pre = elt("pre", [anchor]);
    removeChildrenAndAdd(display.measure, pre);
    var width = anchor.offsetWidth;
    if (width > 2) display.cachedCharWidth = width;
    return width || 10;
  }

  // OPERATIONS

  // Operations are used to wrap changes in such a way that each
  // change won't have to update the cursor and display (which would
  // be awkward, slow, and error-prone), but instead updates are
  // batched and then all combined and executed at once.

  var nextOpId = 0;
  function startOperation(cm) {
    cm.curOp = {
      // An array of ranges of lines that have to be updated. See
      // updateDisplay.
      changes: [],
      updateInput: null,
      userSelChange: null,
      textChanged: null,
      selectionChanged: false,
      updateMaxLine: false,
      updateScrollPos: false,
      id: ++nextOpId
    };
    if (!delayedCallbackDepth++) delayedCallbacks = [];
  }

  function endOperation(cm) {
    var op = cm.curOp, doc = cm.doc, display = cm.display;
    cm.curOp = null;

    if (op.updateMaxLine) computeMaxLength(cm);
    if (display.maxLineChanged && !cm.options.lineWrapping) {
      var width = measureLineWidth(cm, display.maxLine);
      display.sizer.style.minWidth = Math.max(0, width + 3 + scrollerCutOff) + "px";
      display.maxLineChanged = false;
      var maxScrollLeft = Math.max(0, display.sizer.offsetLeft + display.sizer.offsetWidth - display.scroller.clientWidth);
      if (maxScrollLeft < doc.scrollLeft && !op.updateScrollPos)
        setScrollLeft(cm, Math.min(display.scroller.scrollLeft, maxScrollLeft), true);
    }
    var newScrollPos, updated;
    if (op.updateScrollPos) {
      newScrollPos = op.updateScrollPos;
    } else if (op.selectionChanged && display.scroller.clientHeight) { // don't rescroll if not visible
      var coords = cursorCoords(cm, doc.sel.head);
      newScrollPos = calculateScrollPos(cm, coords.left, coords.top, coords.left, coords.bottom);
    }
    if (op.changes.length || newScrollPos && newScrollPos.scrollTop != null)
      updated = updateDisplay(cm, op.changes, newScrollPos && newScrollPos.scrollTop);
    if (!updated && op.selectionChanged) updateSelection(cm);
    if (op.updateScrollPos) {
      display.scroller.scrollTop = display.scrollbarV.scrollTop = doc.scrollTop = newScrollPos.scrollTop;
      display.scroller.scrollLeft = display.scrollbarH.scrollLeft = doc.scrollLeft = newScrollPos.scrollLeft;
      alignHorizontally(cm);
    } else if (newScrollPos) {
      scrollCursorIntoView(cm);
    }
    if (op.selectionChanged) restartBlink(cm);

    if (cm.state.focused && op.updateInput)
      resetInput(cm, op.userSelChange);

    var hidden = op.maybeHiddenMarkers, unhidden = op.maybeUnhiddenMarkers;
    if (hidden) for (var i = 0; i < hidden.length; ++i)
      if (!hidden[i].lines.length) signal(hidden[i], "hide");
    if (unhidden) for (var i = 0; i < unhidden.length; ++i)
      if (unhidden[i].lines.length) signal(unhidden[i], "unhide");

    var delayed;
    if (!--delayedCallbackDepth) {
      delayed = delayedCallbacks;
      delayedCallbacks = null;
    }
    if (op.textChanged)
      signal(cm, "change", cm, op.textChanged);
    if (op.selectionChanged) signal(cm, "cursorActivity", cm);
    if (delayed) for (var i = 0; i < delayed.length; ++i) delayed[i]();
  }

  // Wraps a function in an operation. Returns the wrapped function.
  function operation(cm1, f) {
    return function() {
      var cm = cm1 || this, withOp = !cm.curOp;
      if (withOp) startOperation(cm);
      try { var result = f.apply(cm, arguments); }
      finally { if (withOp) endOperation(cm); }
      return result;
    };
  }
  function docOperation(f) {
    return function() {
      var withOp = this.cm && !this.cm.curOp, result;
      if (withOp) startOperation(this.cm);
      try { result = f.apply(this, arguments); }
      finally { if (withOp) endOperation(this.cm); }
      return result;
    };
  }
  function runInOp(cm, f) {
    var withOp = !cm.curOp, result;
    if (withOp) startOperation(cm);
    try { result = f(); }
    finally { if (withOp) endOperation(cm); }
    return result;
  }

  function regChange(cm, from, to, lendiff) {
    if (from == null) from = cm.doc.first;
    if (to == null) to = cm.doc.first + cm.doc.size;
    cm.curOp.changes.push({from: from, to: to, diff: lendiff});
  }

  // INPUT HANDLING

  function slowPoll(cm) {
    if (cm.display.pollingFast) return;
    cm.display.poll.set(cm.options.pollInterval, function() {
      readInput(cm);
      if (cm.state.focused) slowPoll(cm);
    });
  }

  function fastPoll(cm) {
    var missed = false;
    cm.display.pollingFast = true;
    function p() {
      var changed = readInput(cm);
      if (!changed && !missed) {missed = true; cm.display.poll.set(60, p);}
      else {cm.display.pollingFast = false; slowPoll(cm);}
    }
    cm.display.poll.set(20, p);
  }

  // prevInput is a hack to work with IME. If we reset the textarea
  // on every change, that breaks IME. So we look for changes
  // compared to the previous content instead. (Modern browsers have
  // events that indicate IME taking place, but these are not widely
  // supported or compatible enough yet to rely on.)
  function readInput(cm) {
    var input = cm.display.input, prevInput = cm.display.prevInput, doc = cm.doc, sel = doc.sel;
    if (!cm.state.focused || hasSelection(input) || isReadOnly(cm)) return false;
    var text = input.value;
    if (text == prevInput && posEq(sel.from, sel.to)) return false;
    // IE enjoys randomly deselecting our input's text when
    // re-focusing. If the selection is gone but the cursor is at the
    // start of the input, that's probably what happened.
    if (ie && text && input.selectionStart === 0) {
      resetInput(cm, true);
      return false;
    }
    var withOp = !cm.curOp;
    if (withOp) startOperation(cm);
    sel.shift = false;
    var same = 0, l = Math.min(prevInput.length, text.length);
    while (same < l && prevInput[same] == text[same]) ++same;
    var from = sel.from, to = sel.to;
    if (same < prevInput.length)
      from = Pos(from.line, from.ch - (prevInput.length - same));
    else if (cm.state.overwrite && posEq(from, to) && !cm.state.pasteIncoming)
      to = Pos(to.line, Math.min(getLine(doc, to.line).text.length, to.ch + (text.length - same)));
    var updateInput = cm.curOp.updateInput;
    makeChange(cm.doc, {from: from, to: to, text: splitLines(text.slice(same)),
                        origin: cm.state.pasteIncoming ? "paste" : "+input"}, "end");
               
    cm.curOp.updateInput = updateInput;
    if (text.length > 1000) input.value = cm.display.prevInput = "";
    else cm.display.prevInput = text;
    if (withOp) endOperation(cm);
    cm.state.pasteIncoming = false;
    return true;
  }

  function resetInput(cm, user) {
    var minimal, selected, doc = cm.doc;
    if (!posEq(doc.sel.from, doc.sel.to)) {
      cm.display.prevInput = "";
      minimal = hasCopyEvent &&
        (doc.sel.to.line - doc.sel.from.line > 100 || (selected = cm.getSelection()).length > 1000);
      if (minimal) cm.display.input.value = "-";
      else cm.display.input.value = selected || cm.getSelection();
      if (cm.state.focused) selectInput(cm.display.input);
    } else if (user) cm.display.prevInput = cm.display.input.value = "";
    cm.display.inaccurateSelection = minimal;
  }

  function focusInput(cm) {
    if (cm.options.readOnly != "nocursor" && (!mobile || document.activeElement != cm.display.input))
      cm.display.input.focus();
  }

  function isReadOnly(cm) {
    return cm.options.readOnly || cm.doc.cantEdit;
  }

  // EVENT HANDLERS

  function registerEventHandlers(cm) {
    var d = cm.display;
    on(d.scroller, "mousedown", operation(cm, onMouseDown));
    on(d.scroller, "dblclick", operation(cm, e_preventDefault));
    on(d.lineSpace, "selectstart", function(e) {
      if (!eventInWidget(d, e)) e_preventDefault(e);
    });
    // Gecko browsers fire contextmenu *after* opening the menu, at
    // which point we can't mess with it anymore. Context menu is
    // handled in onMouseDown for Gecko.
    if (!captureMiddleClick) on(d.scroller, "contextmenu", function(e) {onContextMenu(cm, e);});

    on(d.scroller, "scroll", function() {
      setScrollTop(cm, d.scroller.scrollTop);
      setScrollLeft(cm, d.scroller.scrollLeft, true);
      signal(cm, "scroll", cm);
    });
    on(d.scrollbarV, "scroll", function() {
      setScrollTop(cm, d.scrollbarV.scrollTop);
    });
    on(d.scrollbarH, "scroll", function() {
      setScrollLeft(cm, d.scrollbarH.scrollLeft);
    });

    on(d.scroller, "mousewheel", function(e){onScrollWheel(cm, e);});
    on(d.scroller, "DOMMouseScroll", function(e){onScrollWheel(cm, e);});

    function reFocus() { if (cm.state.focused) setTimeout(bind(focusInput, cm), 0); }
    on(d.scrollbarH, "mousedown", reFocus);
    on(d.scrollbarV, "mousedown", reFocus);
    // Prevent wrapper from ever scrolling
    on(d.wrapper, "scroll", function() { d.wrapper.scrollTop = d.wrapper.scrollLeft = 0; });

    function onResize() {
      // Might be a text scaling operation, clear size caches.
      d.cachedCharWidth = d.cachedTextHeight = null;
      clearCaches(cm);
      runInOp(cm, bind(regChange, cm));
    }
    on(window, "resize", onResize);
    // Above handler holds on to the editor and its data structures.
    // Here we poll to unregister it when the editor is no longer in
    // the document, so that it can be garbage-collected.
    function unregister() {
      for (var p = d.wrapper.parentNode; p && p != document.body; p = p.parentNode) {}
      if (p) setTimeout(unregister, 5000);
      else off(window, "resize", onResize);
    }    
    setTimeout(unregister, 5000);

    on(d.input, "keyup", operation(cm, function(e) {
      if (cm.options.onKeyEvent && cm.options.onKeyEvent(cm, addStop(e))) return;
      if (e.keyCode == 16) cm.doc.sel.shift = false;
    }));
    on(d.input, "input", bind(fastPoll, cm));
    on(d.input, "keydown", operation(cm, onKeyDown));
    on(d.input, "keypress", operation(cm, onKeyPress));
    on(d.input, "focus", bind(onFocus, cm));
    on(d.input, "blur", bind(onBlur, cm));

    function drag_(e) {
      if (cm.options.onDragEvent && cm.options.onDragEvent(cm, addStop(e))) return;
      e_stop(e);
    }
    if (cm.options.dragDrop) {
      on(d.scroller, "dragstart", function(e){onDragStart(cm, e);});
      on(d.scroller, "dragenter", drag_);
      on(d.scroller, "dragover", drag_);
      on(d.scroller, "drop", operation(cm, onDrop));
    }
    on(d.scroller, "paste", function(e){
      if (eventInWidget(d, e)) return;
      focusInput(cm); 
      fastPoll(cm);
    });
    on(d.input, "paste", function() {
      cm.state.pasteIncoming = true;
      fastPoll(cm);
    });

    function prepareCopy() {
      if (d.inaccurateSelection) {
        d.prevInput = "";
        d.inaccurateSelection = false;
        d.input.value = cm.getSelection();
        selectInput(d.input);
      }
    }
    on(d.input, "cut", prepareCopy);
    on(d.input, "copy", prepareCopy);

    // Needed to handle Tab key in KHTML
    if (khtml) on(d.sizer, "mouseup", function() {
        if (document.activeElement == d.input) d.input.blur();
        focusInput(cm);
    });
  }

  function eventInWidget(display, e) {
    for (var n = e_target(e); n != display.wrapper; n = n.parentNode) {
      if (!n) return true;
      if (/\bCodeMirror-(?:line)?widget\b/.test(n.className) ||
          n.parentNode == display.sizer && n != display.mover) return true;
    }
  }

  function posFromMouse(cm, e, liberal) {
    var display = cm.display;
    if (!liberal) {
      var target = e_target(e);
      if (target == display.scrollbarH || target == display.scrollbarH.firstChild ||
          target == display.scrollbarV || target == display.scrollbarV.firstChild ||
          target == display.scrollbarFiller) return null;
    }
    var x, y, space = getRect(display.lineSpace);
    // Fails unpredictably on IE[67] when mouse is dragged around quickly.
    try { x = e.clientX; y = e.clientY; } catch (e) { return null; }
    return coordsChar(cm, x - space.left, y - space.top);
  }

  var lastClick, lastDoubleClick;
  function onMouseDown(e) {
    var cm = this, display = cm.display, doc = cm.doc, sel = doc.sel;
    sel.shift = e.shiftKey;

    if (eventInWidget(display, e)) {
      if (!webkit) {
        display.scroller.draggable = false;
        setTimeout(function(){display.scroller.draggable = true;}, 100);
      }
      return;
    }
    if (clickInGutter(cm, e)) return;
    var start = posFromMouse(cm, e);

    switch (e_button(e)) {
    case 3:
      if (captureMiddleClick) onContextMenu.call(cm, cm, e);
      return;
    case 2:
      if (start) extendSelection(cm.doc, start);
      setTimeout(bind(focusInput, cm), 20);
      e_preventDefault(e);
      return;
    }
    // For button 1, if it was clicked inside the editor
    // (posFromMouse returning non-null), we have to adjust the
    // selection.
    if (!start) {if (e_target(e) == display.scroller) e_preventDefault(e); return;}

    if (!cm.state.focused) onFocus(cm);

    var now = +new Date, type = "single";
    if (lastDoubleClick && lastDoubleClick.time > now - 400 && posEq(lastDoubleClick.pos, start)) {
      type = "triple";
      e_preventDefault(e);
      setTimeout(bind(focusInput, cm), 20);
      selectLine(cm, start.line);
    } else if (lastClick && lastClick.time > now - 400 && posEq(lastClick.pos, start)) {
      type = "double";
      lastDoubleClick = {time: now, pos: start};
      e_preventDefault(e);
      var word = findWordAt(getLine(doc, start.line).text, start);
      extendSelection(cm.doc, word.from, word.to);
    } else { lastClick = {time: now, pos: start}; }

    var last = start;
    if (cm.options.dragDrop && dragAndDrop && !isReadOnly(cm) && !posEq(sel.from, sel.to) &&
        !posLess(start, sel.from) && !posLess(sel.to, start) && type == "single") {
      var dragEnd = operation(cm, function(e2) {
        if (webkit) display.scroller.draggable = false;
        cm.state.draggingText = false;
        off(document, "mouseup", dragEnd);
        off(display.scroller, "drop", dragEnd);
        if (Math.abs(e.clientX - e2.clientX) + Math.abs(e.clientY - e2.clientY) < 10) {
          e_preventDefault(e2);
          extendSelection(cm.doc, start);
          focusInput(cm);
        }
      });
      // Let the drag handler handle this.
      if (webkit) display.scroller.draggable = true;
      cm.state.draggingText = dragEnd;
      // IE's approach to draggable
      if (display.scroller.dragDrop) display.scroller.dragDrop();
      on(document, "mouseup", dragEnd);
      on(display.scroller, "drop", dragEnd);
      return;
    }
    e_preventDefault(e);
    if (type == "single") extendSelection(cm.doc, clipPos(doc, start));

    var startstart = sel.from, startend = sel.to;

    function doSelect(cur) {
      if (type == "single") {
        extendSelection(cm.doc, clipPos(doc, start), cur);
        return;
      }

      startstart = clipPos(doc, startstart);
      startend = clipPos(doc, startend);
      if (type == "double") {
        var word = findWordAt(getLine(doc, cur.line).text, cur);
        if (posLess(cur, startstart)) extendSelection(cm.doc, word.from, startend);
        else extendSelection(cm.doc, startstart, word.to);
      } else if (type == "triple") {
        if (posLess(cur, startstart)) extendSelection(cm.doc, startend, clipPos(doc, Pos(cur.line, 0)));
        else extendSelection(cm.doc, startstart, clipPos(doc, Pos(cur.line + 1, 0)));
      }
    }

    var editorSize = getRect(display.wrapper);
    // Used to ensure timeout re-tries don't fire when another extend
    // happened in the meantime (clearTimeout isn't reliable -- at
    // least on Chrome, the timeouts still happen even when cleared,
    // if the clear happens after their scheduled firing time).
    var counter = 0;

    function extend(e) {
      var curCount = ++counter;
      var cur = posFromMouse(cm, e, true);
      if (!cur) return;
      if (!posEq(cur, last)) {
        if (!cm.state.focused) onFocus(cm);
        last = cur;
        doSelect(cur);
        var visible = visibleLines(display, doc);
        if (cur.line >= visible.to || cur.line < visible.from)
          setTimeout(operation(cm, function(){if (counter == curCount) extend(e);}), 150);
      } else {
        var outside = e.clientY < editorSize.top ? -20 : e.clientY > editorSize.bottom ? 20 : 0;
        if (outside) setTimeout(operation(cm, function() {
          if (counter != curCount) return;
          display.scroller.scrollTop += outside;
          extend(e);
        }), 50);
      }
    }

    function done(e) {
      counter = Infinity;
      var cur = posFromMouse(cm, e);
      if (cur) doSelect(cur);
      e_preventDefault(e);
      focusInput(cm);
      off(document, "mousemove", move);
      off(document, "mouseup", up);
    }

    var move = operation(cm, function(e) {
      if (!ie && !e_button(e)) done(e);
      else extend(e);
    });
    var up = operation(cm, done);
    on(document, "mousemove", move);
    on(document, "mouseup", up);
  }

  function onDrop(e) {
    var cm = this;
    if (eventInWidget(cm.display, e) || (cm.options.onDragEvent && cm.options.onDragEvent(cm, addStop(e))))
      return;
    e_preventDefault(e);
    var pos = posFromMouse(cm, e, true), files = e.dataTransfer.files;
    if (!pos || isReadOnly(cm)) return;
    if (files && files.length && window.FileReader && window.File) {
      var n = files.length, text = Array(n), read = 0;
      var loadFile = function(file, i) {
        var reader = new FileReader;
        reader.onload = function() {
          text[i] = reader.result;
          if (++read == n) {
            pos = clipPos(cm.doc, pos);
            makeChange(cm.doc, {from: pos, to: pos, text: splitLines(text.join("\n")), origin: "paste"}, "around");
          }
        };
        reader.readAsText(file);
      };
      for (var i = 0; i < n; ++i) loadFile(files[i], i);
    } else {
      // Don't do a replace if the drop happened inside of the selected text.
      if (cm.state.draggingText && !(posLess(pos, cm.doc.sel.from) || posLess(cm.doc.sel.to, pos))) {
        cm.state.draggingText(e);
        // Ensure the editor is re-focused
        setTimeout(bind(focusInput, cm), 20);
        return;
      }
      try {
        var text = e.dataTransfer.getData("Text");
        if (text) {
          var curFrom = cm.doc.sel.from, curTo = cm.doc.sel.to;
          setSelection(cm.doc, pos, pos);
          if (cm.state.draggingText) replaceRange(cm.doc, "", curFrom, curTo, "paste");
          cm.replaceSelection(text, null, "paste");
          focusInput(cm);
          onFocus(cm);
        }
      }
      catch(e){}
    }
  }

  function clickInGutter(cm, e) {
    var display = cm.display;
    try { var mX = e.clientX, mY = e.clientY; }
    catch(e) { return false; }

    if (mX >= Math.floor(getRect(display.gutters).right)) return false;
    e_preventDefault(e);
    if (!hasHandler(cm, "gutterClick")) return true;

    var lineBox = getRect(display.lineDiv);
    if (mY > lineBox.bottom) return true;
    mY -= lineBox.top - display.viewOffset;

    for (var i = 0; i < cm.options.gutters.length; ++i) {
      var g = display.gutters.childNodes[i];
      if (g && getRect(g).right >= mX) {
        var line = lineAtHeight(cm.doc, mY);
        var gutter = cm.options.gutters[i];
        signalLater(cm, "gutterClick", cm, line, gutter, e);
        break;
      }
    }
    return true;
  }

  function onDragStart(cm, e) {
    if (eventInWidget(cm.display, e)) return;
    
    var txt = cm.getSelection();
    e.dataTransfer.setData("Text", txt);

    // Use dummy image instead of default browsers image.
    // Recent Safari (~6.0.2) have a tendency to segfault when this happens, so we don't do it there.
    if (e.dataTransfer.setDragImage) {
      var img = elt("img", null, null, "position: fixed; left: 0; top: 0;");
      if (opera) {
        img.width = img.height = 1;
        cm.display.wrapper.appendChild(img);
        // Force a relayout, or Opera won't use our image for some obscure reason
        img._top = img.offsetTop;
      }
      if (safari) {
        if (cm.display.dragImg) {
          img = cm.display.dragImg;
        } else {
          cm.display.dragImg = img;
          img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
          cm.display.wrapper.appendChild(img);
        }
      }
      e.dataTransfer.setDragImage(img, 0, 0);
      if (opera) img.parentNode.removeChild(img);
    }
  }

  function setScrollTop(cm, val) {
    if (Math.abs(cm.doc.scrollTop - val) < 2) return;
    cm.doc.scrollTop = val;
    if (!gecko) updateDisplay(cm, [], val);
    if (cm.display.scroller.scrollTop != val) cm.display.scroller.scrollTop = val;
    if (cm.display.scrollbarV.scrollTop != val) cm.display.scrollbarV.scrollTop = val;
    if (gecko) updateDisplay(cm, []);
  }
  function setScrollLeft(cm, val, isScroller) {
    if (isScroller ? val == cm.doc.scrollLeft : Math.abs(cm.doc.scrollLeft - val) < 2) return;
    val = Math.min(val, cm.display.scroller.scrollWidth - cm.display.scroller.clientWidth);
    cm.doc.scrollLeft = val;
    alignHorizontally(cm);
    if (cm.display.scroller.scrollLeft != val) cm.display.scroller.scrollLeft = val;
    if (cm.display.scrollbarH.scrollLeft != val) cm.display.scrollbarH.scrollLeft = val;
  }

  // Since the delta values reported on mouse wheel events are
  // unstandardized between browsers and even browser versions, and
  // generally horribly unpredictable, this code starts by measuring
  // the scroll effect that the first few mouse wheel events have,
  // and, from that, detects the way it can convert deltas to pixel
  // offsets afterwards.
  //
  // The reason we want to know the amount a wheel event will scroll
  // is that it gives us a chance to update the display before the
  // actual scrolling happens, reducing flickering.

  var wheelSamples = 0, wheelPixelsPerUnit = null;
  // Fill in a browser-detected starting value on browsers where we
  // know one. These don't have to be accurate -- the result of them
  // being wrong would just be a slight flicker on the first wheel
  // scroll (if it is large enough).
  if (ie) wheelPixelsPerUnit = -.53;
  else if (gecko) wheelPixelsPerUnit = 15;
  else if (chrome) wheelPixelsPerUnit = -.7;
  else if (safari) wheelPixelsPerUnit = -1/3;

  function onScrollWheel(cm, e) {
    var dx = e.wheelDeltaX, dy = e.wheelDeltaY;
    if (dx == null && e.detail && e.axis == e.HORIZONTAL_AXIS) dx = e.detail;
    if (dy == null && e.detail && e.axis == e.VERTICAL_AXIS) dy = e.detail;
    else if (dy == null) dy = e.wheelDelta;

    // Webkit browsers on OS X abort momentum scrolls when the target
    // of the scroll event is removed from the scrollable element.
    // This hack (see related code in patchDisplay) makes sure the
    // element is kept around.
    if (dy && mac && webkit) {
      for (var cur = e.target; cur != scroll; cur = cur.parentNode) {
        if (cur.lineObj) {
          cm.display.currentWheelTarget = cur;
          break;
        }
      }
    }

    var display = cm.display, scroll = display.scroller;
    // On some browsers, horizontal scrolling will cause redraws to
    // happen before the gutter has been realigned, causing it to
    // wriggle around in a most unseemly way. When we have an
    // estimated pixels/delta value, we just handle horizontal
    // scrolling entirely here. It'll be slightly off from native, but
    // better than glitching out.
    if (dx && !gecko && !opera && wheelPixelsPerUnit != null) {
      if (dy)
        setScrollTop(cm, Math.max(0, Math.min(scroll.scrollTop + dy * wheelPixelsPerUnit, scroll.scrollHeight - scroll.clientHeight)));
      setScrollLeft(cm, Math.max(0, Math.min(scroll.scrollLeft + dx * wheelPixelsPerUnit, scroll.scrollWidth - scroll.clientWidth)));
      e_preventDefault(e);
      display.wheelStartX = null; // Abort measurement, if in progress
      return;
    }

    if (dy && wheelPixelsPerUnit != null) {
      var pixels = dy * wheelPixelsPerUnit;
      var top = cm.doc.scrollTop, bot = top + display.wrapper.clientHeight;
      if (pixels < 0) top = Math.max(0, top + pixels - 50);
      else bot = Math.min(cm.doc.height, bot + pixels + 50);
      updateDisplay(cm, [], {top: top, bottom: bot});
    }

    if (wheelSamples < 20) {
      if (display.wheelStartX == null) {
        display.wheelStartX = scroll.scrollLeft; display.wheelStartY = scroll.scrollTop;
        display.wheelDX = dx; display.wheelDY = dy;
        setTimeout(function() {
          if (display.wheelStartX == null) return;
          var movedX = scroll.scrollLeft - display.wheelStartX;
          var movedY = scroll.scrollTop - display.wheelStartY;
          var sample = (movedY && display.wheelDY && movedY / display.wheelDY) ||
            (movedX && display.wheelDX && movedX / display.wheelDX);
          display.wheelStartX = display.wheelStartY = null;
          if (!sample) return;
          wheelPixelsPerUnit = (wheelPixelsPerUnit * wheelSamples + sample) / (wheelSamples + 1);
          ++wheelSamples;
        }, 200);
      } else {
        display.wheelDX += dx; display.wheelDY += dy;
      }
    }
  }

  function doHandleBinding(cm, bound, dropShift) {
    if (typeof bound == "string") {
      bound = commands[bound];
      if (!bound) return false;
    }
    // Ensure previous input has been read, so that the handler sees a
    // consistent view of the document
    if (cm.display.pollingFast && readInput(cm)) cm.display.pollingFast = false;
    var doc = cm.doc, prevShift = doc.sel.shift, done = false;
    try {
      if (isReadOnly(cm)) cm.state.suppressEdits = true;
      if (dropShift) doc.sel.shift = false;
      done = bound(cm) != Pass;
    } finally {
      doc.sel.shift = prevShift;
      cm.state.suppressEdits = false;
    }
    return done;
  }

  function allKeyMaps(cm) {
    var maps = cm.state.keyMaps.slice(0);
    maps.push(cm.options.keyMap);
    if (cm.options.extraKeys) maps.unshift(cm.options.extraKeys);
    return maps;
  }

  var maybeTransition;
  function handleKeyBinding(cm, e) {
    // Handle auto keymap transitions
    var startMap = getKeyMap(cm.options.keyMap), next = startMap.auto;
    clearTimeout(maybeTransition);
    if (next && !isModifierKey(e)) maybeTransition = setTimeout(function() {
      if (getKeyMap(cm.options.keyMap) == startMap)
        cm.options.keyMap = (next.call ? next.call(null, cm) : next);
    }, 50);

    var name = keyName(e, true), handled = false;
    if (!name) return false;
    var keymaps = allKeyMaps(cm);

    if (e.shiftKey) {
      // First try to resolve full name (including 'Shift-'). Failing
      // that, see if there is a cursor-motion command (starting with
      // 'go') bound to the keyname without 'Shift-'.
      handled = lookupKey("Shift-" + name, keymaps, function(b) {return doHandleBinding(cm, b, true);})
             || lookupKey(name, keymaps, function(b) {
                  if (typeof b == "string" && /^go[A-Z]/.test(b)) return doHandleBinding(cm, b);
                });
    } else {
      handled = lookupKey(name, keymaps, function(b) { return doHandleBinding(cm, b); });
    }
    if (handled == "stop") handled = false;

    if (handled) {
      e_preventDefault(e);
      restartBlink(cm);
      if (ie_lt9) { e.oldKeyCode = e.keyCode; e.keyCode = 0; }
    }
    return handled;
  }

  function handleCharBinding(cm, e, ch) {
    var handled = lookupKey("'" + ch + "'", allKeyMaps(cm),
                            function(b) { return doHandleBinding(cm, b, true); });
    if (handled) {
      e_preventDefault(e);
      restartBlink(cm);
    }
    return handled;
  }

  var lastStoppedKey = null;
  function onKeyDown(e) {
    var cm = this;
    if (!cm.state.focused) onFocus(cm);
    if (ie && e.keyCode == 27) { e.returnValue = false; }
    if (cm.options.onKeyEvent && cm.options.onKeyEvent(cm, addStop(e))) return;
    var code = e.keyCode;
    // IE does strange things with escape.
    cm.doc.sel.shift = code == 16 || e.shiftKey;
    // First give onKeyEvent option a chance to handle this.
    var handled = handleKeyBinding(cm, e);
    if (opera) {
      lastStoppedKey = handled ? code : null;
      // Opera has no cut event... we try to at least catch the key combo
      if (!handled && code == 88 && !hasCopyEvent && (mac ? e.metaKey : e.ctrlKey))
        cm.replaceSelection("");
    }
  }

  function onKeyPress(e) {
    var cm = this;
    if (cm.options.onKeyEvent && cm.options.onKeyEvent(cm, addStop(e))) return;
    var keyCode = e.keyCode, charCode = e.charCode;
    if (opera && keyCode == lastStoppedKey) {lastStoppedKey = null; e_preventDefault(e); return;}
    if (((opera && (!e.which || e.which < 10)) || khtml) && handleKeyBinding(cm, e)) return;
    var ch = String.fromCharCode(charCode == null ? keyCode : charCode);
    if (this.options.electricChars && this.doc.mode.electricChars &&
        this.options.smartIndent && !isReadOnly(this) &&
        this.doc.mode.electricChars.indexOf(ch) > -1)
      setTimeout(operation(cm, function() {indentLine(cm, cm.doc.sel.to.line, "smart");}), 75);
    if (handleCharBinding(cm, e, ch)) return;
    fastPoll(cm);
  }

  function onFocus(cm) {
    if (cm.options.readOnly == "nocursor") return;
    if (!cm.state.focused) {
      signal(cm, "focus", cm);
      cm.state.focused = true;
      if (cm.display.wrapper.className.search(/\bCodeMirror-focused\b/) == -1)
        cm.display.wrapper.className += " CodeMirror-focused";
      resetInput(cm, true);
    }
    slowPoll(cm);
    restartBlink(cm);
  }
  function onBlur(cm) {
    if (cm.state.focused) {
      signal(cm, "blur", cm);
      cm.state.focused = false;
      cm.display.wrapper.className = cm.display.wrapper.className.replace(" CodeMirror-focused", "");
    }
    clearInterval(cm.display.blinker);
    setTimeout(function() {if (!cm.state.focused) cm.doc.sel.shift = false;}, 150);
  }

  var detectingSelectAll;
  function onContextMenu(cm, e) {
    var display = cm.display, sel = cm.doc.sel;
    if (eventInWidget(display, e)) return;

    var pos = posFromMouse(cm, e), scrollPos = display.scroller.scrollTop;
    if (!pos || opera) return; // Opera is difficult.
    if (posEq(sel.from, sel.to) || posLess(pos, sel.from) || !posLess(pos, sel.to))
      operation(cm, setSelection)(cm.doc, pos, pos);

    var oldCSS = display.input.style.cssText;
    display.inputDiv.style.position = "absolute";
    display.input.style.cssText = "position: fixed; width: 30px; height: 30px; top: " + (e.clientY - 5) +
      "px; left: " + (e.clientX - 5) + "px; z-index: 1000; background: white; outline: none;" +
      "border-width: 0; outline: none; overflow: hidden; opacity: .05; -ms-opacity: .05; filter: alpha(opacity=5);";
    focusInput(cm);
    resetInput(cm, true);
    // Adds "Select all" to context menu in FF
    if (posEq(sel.from, sel.to)) display.input.value = display.prevInput = " ";

    function rehide() {
      display.inputDiv.style.position = "relative";
      display.input.style.cssText = oldCSS;
      if (ie_lt9) display.scrollbarV.scrollTop = display.scroller.scrollTop = scrollPos;
      slowPoll(cm);

      // Try to detect the user choosing select-all 
      if (display.input.selectionStart != null && (!ie || ie_lt9)) {
        clearTimeout(detectingSelectAll);
        var extval = display.input.value = " " + (posEq(sel.from, sel.to) ? "" : display.input.value), i = 0;
        display.prevInput = " ";
        display.input.selectionStart = 1; display.input.selectionEnd = extval.length;
        var poll = function(){
          if (display.prevInput == " " && display.input.selectionStart == 0)
            operation(cm, commands.selectAll)(cm);
          else if (i++ < 10) detectingSelectAll = setTimeout(poll, 500);
          else resetInput(cm);
        };
        detectingSelectAll = setTimeout(poll, 200);
      }
    }

    if (captureMiddleClick) {
      e_stop(e);
      var mouseup = function() {
        off(window, "mouseup", mouseup);
        setTimeout(rehide, 20);
      };
      on(window, "mouseup", mouseup);
    } else {
      setTimeout(rehide, 50);
    }
  }

  // UPDATING

  function changeEnd(change) {
    return Pos(change.from.line + change.text.length - 1,
               lst(change.text).length + (change.text.length == 1 ? change.from.ch : 0));
  }

  // Make sure a position will be valid after the given change.
  function clipPostChange(doc, change, pos) {
    if (!posLess(change.from, pos)) return clipPos(doc, pos);
    var diff = (change.text.length - 1) - (change.to.line - change.from.line);
    if (pos.line > change.to.line + diff) {
      var preLine = pos.line - diff, lastLine = doc.first + doc.size - 1;
      if (preLine > lastLine) return Pos(lastLine, getLine(doc, lastLine).text.length);
      return clipToLen(pos, getLine(doc, preLine).text.length);
    }
    if (pos.line == change.to.line + diff)
      return clipToLen(pos, lst(change.text).length + (change.text.length == 1 ? change.from.ch : 0) +
                       getLine(doc, change.to.line).text.length - change.to.ch);
    var inside = pos.line - change.from.line;
    return clipToLen(pos, change.text[inside].length + (inside ? 0 : change.from.ch));
  }

  // Hint can be null|"end"|"start"|"around"|{anchor,head}
  function computeSelAfterChange(doc, change, hint) {
    if (hint && typeof hint == "object") // Assumed to be {anchor, head} object
      return {anchor: clipPostChange(doc, change, hint.anchor),
              head: clipPostChange(doc, change, hint.head)};

    if (hint == "start") return {anchor: change.from, head: change.from};
    
    var end = changeEnd(change);
    if (hint == "around") return {anchor: change.from, head: end};
    if (hint == "end") return {anchor: end, head: end};

    // hint is null, leave the selection alone as much as possible
    var adjustPos = function(pos) {
      if (posLess(pos, change.from)) return pos;
      if (!posLess(change.to, pos)) return end;

      var line = pos.line + change.text.length - (change.to.line - change.from.line) - 1, ch = pos.ch;
      if (pos.line == change.to.line) ch += end.ch - change.to.ch;
      return Pos(line, ch);
    };
    return {anchor: adjustPos(doc.sel.anchor), head: adjustPos(doc.sel.head)};
  }

  function filterChange(doc, change) {
    var obj = {
      canceled: false,
      from: change.from,
      to: change.to,
      text: change.text,
      origin: change.origin,
      update: function(from, to, text, origin) {
        if (from) this.from = clipPos(doc, from);
        if (to) this.to = clipPos(doc, to);
        if (text) this.text = text;
        if (origin !== undefined) this.origin = origin;
      },
      cancel: function() { this.canceled = true; }
    };
    signal(doc, "beforeChange", doc, obj);
    if (doc.cm) signal(doc.cm, "beforeChange", doc.cm, obj);

    if (obj.canceled) return null;
    return {from: obj.from, to: obj.to, text: obj.text, origin: obj.origin};
  }

  // Replace the range from from to to by the strings in replacement.
  // change is a {from, to, text [, origin]} object
  function makeChange(doc, change, selUpdate, ignoreReadOnly) {
    if (doc.cm) {
      if (!doc.cm.curOp) return operation(doc.cm, makeChange)(doc, change, selUpdate, ignoreReadOnly);
      if (doc.cm.state.suppressEdits) return;
    }

    if (hasHandler(doc, "beforeChange") || doc.cm && hasHandler(doc.cm, "beforeChange")) {
      change = filterChange(doc, change);
      if (!change) return;
    }

    // Possibly split or suppress the update based on the presence
    // of read-only spans in its range.
    var split = sawReadOnlySpans && !ignoreReadOnly && removeReadOnlyRanges(doc, change.from, change.to);
    if (split) {
      for (var i = split.length - 1; i >= 1; --i)
        makeChangeNoReadonly(doc, {from: split[i].from, to: split[i].to, text: [""]});
      if (split.length)
        makeChangeNoReadonly(doc, {from: split[0].from, to: split[0].to, text: change.text}, selUpdate);
    } else {
      makeChangeNoReadonly(doc, change, selUpdate);
    }
  }

  function makeChangeNoReadonly(doc, change, selUpdate) {
    var selAfter = computeSelAfterChange(doc, change, selUpdate);
    addToHistory(doc, change, selAfter, doc.cm ? doc.cm.curOp.id : NaN);

    makeChangeSingleDoc(doc, change, selAfter, stretchSpansOverChange(doc, change));
    var rebased = [];

    linkedDocs(doc, function(doc, sharedHist) {
      if (!sharedHist && indexOf(rebased, doc.history) == -1) {
        rebaseHist(doc.history, change);
        rebased.push(doc.history);
      }
      makeChangeSingleDoc(doc, change, null, stretchSpansOverChange(doc, change));
    });
  }

  function makeChangeFromHistory(doc, type) {
    var hist = doc.history;
    var event = (type == "undo" ? hist.done : hist.undone).pop();
    if (!event) return;
    hist.dirtyCounter += type == "undo" ? -1 : 1;

    var anti = {changes: [], anchorBefore: event.anchorAfter, headBefore: event.headAfter,
                anchorAfter: event.anchorBefore, headAfter: event.headBefore};
    (type == "undo" ? hist.undone : hist.done).push(anti);

    for (var i = event.changes.length - 1; i >= 0; --i) {
      var change = event.changes[i];
      change.origin = type;
      anti.changes.push(historyChangeFromChange(doc, change));

      var after = i ? computeSelAfterChange(doc, change, null)
                    : {anchor: event.anchorBefore, head: event.headBefore};
      makeChangeSingleDoc(doc, change, after, mergeOldSpans(doc, change));
      var rebased = [];

      linkedDocs(doc, function(doc, sharedHist) {
        if (!sharedHist && indexOf(rebased, doc.history) == -1) {
          rebaseHist(doc.history, change);
          rebased.push(doc.history);
        }
        makeChangeSingleDoc(doc, change, null, mergeOldSpans(doc, change));
      });
    }
  }

  function shiftDoc(doc, distance) {
    function shiftPos(pos) {return Pos(pos.line + distance, pos.ch);}
    doc.first += distance;
    if (doc.cm) regChange(doc.cm, doc.first, doc.first, distance);
    doc.sel.head = shiftPos(doc.sel.head); doc.sel.anchor = shiftPos(doc.sel.anchor);
    doc.sel.from = shiftPos(doc.sel.from); doc.sel.to = shiftPos(doc.sel.to);
  }

  function makeChangeSingleDoc(doc, change, selAfter, spans) {
    if (doc.cm && !doc.cm.curOp)
      return operation(doc.cm, makeChangeSingleDoc)(doc, change, selAfter, spans);

    if (change.to.line < doc.first) {
      shiftDoc(doc, change.text.length - 1 - (change.to.line - change.from.line));
      return;
    }
    if (change.from.line > doc.lastLine()) return;

    // Clip the change to the size of this doc
    if (change.from.line < doc.first) {
      var shift = change.text.length - 1 - (doc.first - change.from.line);
      shiftDoc(doc, shift);
      change = {from: Pos(doc.first, 0), to: Pos(change.to.line + shift, change.to.ch),
                text: [lst(change.text)], origin: change.origin};
    }
    var last = doc.lastLine();
    if (change.to.line > last) {
      change = {from: change.from, to: Pos(last, getLine(doc, last).text.length),
                text: [change.text[0]], origin: change.origin};
    }

    if (!selAfter) selAfter = computeSelAfterChange(doc, change, null);
    if (doc.cm) makeChangeSingleDocInEditor(doc.cm, change, spans, selAfter);
    else updateDoc(doc, change, spans, selAfter);
  }

  function makeChangeSingleDocInEditor(cm, change, spans, selAfter) {
    var doc = cm.doc, display = cm.display, from = change.from, to = change.to;

    var recomputeMaxLength = false, checkWidthStart = from.line;
    if (!cm.options.lineWrapping) {
      checkWidthStart = lineNo(visualLine(doc, getLine(doc, from.line)));
      doc.iter(checkWidthStart, to.line + 1, function(line) {
        if (line == display.maxLine) {
          recomputeMaxLength = true;
          return true;
        }
      });
    }

    updateDoc(doc, change, spans, selAfter, estimateHeight(cm));

    if (!cm.options.lineWrapping) {
      doc.iter(checkWidthStart, from.line + change.text.length, function(line) {
        var len = lineLength(doc, line);
        if (len > display.maxLineLength) {
          display.maxLine = line;
          display.maxLineLength = len;
          display.maxLineChanged = true;
          recomputeMaxLength = false;
        }
      });
      if (recomputeMaxLength) cm.curOp.updateMaxLine = true;
    }

    // Adjust frontier, schedule worker
    doc.frontier = Math.min(doc.frontier, from.line);
    startWorker(cm, 400);

    var lendiff = change.text.length - (to.line - from.line) - 1;
    // Remember that these lines changed, for updating the display
    regChange(cm, from.line, to.line + 1, lendiff);
    if (hasHandler(cm, "change")) {
      var changeObj = {from: from, to: to, text: change.text, origin: change.origin};
      if (cm.curOp.textChanged) {
        for (var cur = cm.curOp.textChanged; cur.next; cur = cur.next) {}
        cur.next = changeObj;
      } else cm.curOp.textChanged = changeObj;
    }
  }

  function replaceRange(doc, code, from, to, origin) {
    if (!to) to = from;
    if (posLess(to, from)) { var tmp = to; to = from; from = tmp; }
    if (typeof code == "string") code = splitLines(code);
    makeChange(doc, {from: from, to: to, text: code, origin: origin}, null);
  }

  // POSITION OBJECT

  function Pos(line, ch) {
    if (!(this instanceof Pos)) return new Pos(line, ch);
    this.line = line; this.ch = ch;
  }
  CodeMirror.Pos = Pos;

  function posEq(a, b) {return a.line == b.line && a.ch == b.ch;}
  function posLess(a, b) {return a.line < b.line || (a.line == b.line && a.ch < b.ch);}
  function copyPos(x) {return Pos(x.line, x.ch);}

  // SELECTION

  function clipLine(doc, n) {return Math.max(doc.first, Math.min(n, doc.first + doc.size - 1));}
  function clipPos(doc, pos) {
    if (pos.line < doc.first) return Pos(doc.first, 0);
    var last = doc.first + doc.size - 1;
    if (pos.line > last) return Pos(last, getLine(doc, last).text.length);
    return clipToLen(pos, getLine(doc, pos.line).text.length);
  }
  function clipToLen(pos, linelen) {
    var ch = pos.ch;
    if (ch == null || ch > linelen) return Pos(pos.line, linelen);
    else if (ch < 0) return Pos(pos.line, 0);
    else return pos;
  }
  function isLine(doc, l) {return l >= doc.first && l < doc.first + doc.size;}

  // If shift is held, this will move the selection anchor. Otherwise,
  // it'll set the whole selection.
  function extendSelection(doc, pos, other, bias) {
    if (doc.sel.shift || doc.sel.extend) {
      var anchor = doc.sel.anchor;
      if (other) {
        var posBefore = posLess(pos, anchor);
        if (posBefore != posLess(other, anchor)) {
          anchor = pos;
          pos = other;
        } else if (posBefore != posLess(pos, other)) {
          pos = other;
        }
      }
      setSelection(doc, anchor, pos, bias);
    } else {
      setSelection(doc, pos, other || pos, bias);
    }
    if (doc.cm) doc.cm.curOp.userSelChange = true;
  }

  function filterSelectionChange(doc, anchor, head) {
    var obj = {anchor: anchor, head: head};
    signal(doc, "beforeSelectionChange", doc, obj);
    if (doc.cm) signal(doc.cm, "beforeSelectionChange", doc.cm, obj);
    obj.anchor = clipPos(doc, obj.anchor); obj.head = clipPos(doc, obj.head);
    return obj;
  }

  // Update the selection. Last two args are only used by
  // updateDoc, since they have to be expressed in the line
  // numbers before the update.
  function setSelection(doc, anchor, head, bias, checkAtomic) {
    if (!checkAtomic && hasHandler(doc, "beforeSelectionChange") || doc.cm && hasHandler(doc.cm, "beforeSelectionChange")) {
      var filtered = filterSelectionChange(doc, anchor, head);
      head = filtered.head;
      anchor = filtered.anchor;
    }

    var sel = doc.sel;
    sel.goalColumn = null;
    // Skip over atomic spans.
    if (checkAtomic || !posEq(anchor, sel.anchor))
      anchor = skipAtomic(doc, anchor, bias, checkAtomic != "push");
    if (checkAtomic || !posEq(head, sel.head))
      head = skipAtomic(doc, head, bias, checkAtomic != "push");

    if (posEq(sel.anchor, anchor) && posEq(sel.head, head)) return;

    sel.anchor = anchor; sel.head = head;
    var inv = posLess(head, anchor);
    sel.from = inv ? head : anchor;
    sel.to = inv ? anchor : head;

    if (doc.cm)
      doc.cm.curOp.updateInput = doc.cm.curOp.selectionChanged = true;

    signalLater(doc, "cursorActivity", doc);
  }

  function reCheckSelection(cm) {
    setSelection(cm.doc, cm.doc.sel.from, cm.doc.sel.to, null, "push");
  }

  function skipAtomic(doc, pos, bias, mayClear) {
    var flipped = false, curPos = pos;
    var dir = bias || 1;
    doc.cantEdit = false;
    search: for (;;) {
      var line = getLine(doc, curPos.line), toClear;
      if (line.markedSpans) {
        for (var i = 0; i < line.markedSpans.length; ++i) {
          var sp = line.markedSpans[i], m = sp.marker;
          if ((sp.from == null || (m.inclusiveLeft ? sp.from <= curPos.ch : sp.from < curPos.ch)) &&
              (sp.to == null || (m.inclusiveRight ? sp.to >= curPos.ch : sp.to > curPos.ch))) {
            if (mayClear && m.clearOnEnter) {
              (toClear || (toClear = [])).push(m);
              continue;
            } else if (!m.atomic) continue;
            var newPos = m.find()[dir < 0 ? "from" : "to"];
            if (posEq(newPos, curPos)) {
              newPos.ch += dir;
              if (newPos.ch < 0) {
                if (newPos.line > doc.first) newPos = clipPos(doc, Pos(newPos.line - 1));
                else newPos = null;
              } else if (newPos.ch > line.text.length) {
                if (newPos.line < doc.first + doc.size - 1) newPos = Pos(newPos.line + 1, 0);
                else newPos = null;
              }
              if (!newPos) {
                if (flipped) {
                  // Driven in a corner -- no valid cursor position found at all
                  // -- try again *with* clearing, if we didn't already
                  if (!mayClear) return skipAtomic(doc, pos, bias, true);
                  // Otherwise, turn off editing until further notice, and return the start of the doc
                  doc.cantEdit = true;
                  return Pos(doc.first, 0);
                }
                flipped = true; newPos = pos; dir = -dir;
              }
            }
            curPos = newPos;
            continue search;
          }
        }
        if (toClear) for (var i = 0; i < toClear.length; ++i) toClear[i].clear();
      }
      return curPos;
    }
  }

  // SCROLLING

  function scrollCursorIntoView(cm) {
    var coords = scrollPosIntoView(cm, cm.doc.sel.head);
    if (!cm.state.focused) return;
    var display = cm.display, box = getRect(display.sizer), doScroll = null;
    if (coords.top + box.top < 0) doScroll = true;
    else if (coords.bottom + box.top > (window.innerHeight || document.documentElement.clientHeight)) doScroll = false;
    if (doScroll != null && !phantom) {
      var hidden = display.cursor.style.display == "none";
      if (hidden) {
        display.cursor.style.display = "";
        display.cursor.style.left = coords.left + "px";
        display.cursor.style.top = (coords.top - display.viewOffset) + "px";
      }
      display.cursor.scrollIntoView(doScroll);
      if (hidden) display.cursor.style.display = "none";
    }
  }

  function scrollPosIntoView(cm, pos) {
    for (;;) {
      var changed = false, coords = cursorCoords(cm, pos);
      var scrollPos = calculateScrollPos(cm, coords.left, coords.top, coords.left, coords.bottom);
      var startTop = cm.doc.scrollTop, startLeft = cm.doc.scrollLeft;
      if (scrollPos.scrollTop != null) {
        setScrollTop(cm, scrollPos.scrollTop);
        if (Math.abs(cm.doc.scrollTop - startTop) > 1) changed = true;
      }
      if (scrollPos.scrollLeft != null) {
        setScrollLeft(cm, scrollPos.scrollLeft);
        if (Math.abs(cm.doc.scrollLeft - startLeft) > 1) changed = true;
      }
      if (!changed) return coords;
    }
  }

  function scrollIntoView(cm, x1, y1, x2, y2) {
    var scrollPos = calculateScrollPos(cm, x1, y1, x2, y2);
    if (scrollPos.scrollTop != null) setScrollTop(cm, scrollPos.scrollTop);
    if (scrollPos.scrollLeft != null) setScrollLeft(cm, scrollPos.scrollLeft);
  }

  function calculateScrollPos(cm, x1, y1, x2, y2) {
    var display = cm.display, pt = paddingTop(display);
    y1 += pt; y2 += pt;
    var screen = display.scroller.clientHeight - scrollerCutOff, screentop = display.scroller.scrollTop, result = {};
    var docBottom = cm.doc.height + 2 * pt;
    var atTop = y1 < pt + 10, atBottom = y2 + pt > docBottom - 10;
    if (y1 < screentop) result.scrollTop = atTop ? 0 : Math.max(0, y1);
    else if (y2 > screentop + screen) result.scrollTop = (atBottom ? docBottom : y2) - screen;

    var screenw = display.scroller.clientWidth - scrollerCutOff, screenleft = display.scroller.scrollLeft;
    x1 += display.gutters.offsetWidth; x2 += display.gutters.offsetWidth;
    var gutterw = display.gutters.offsetWidth;
    var atLeft = x1 < gutterw + 10;
    if (x1 < screenleft + gutterw || atLeft) {
      if (atLeft) x1 = 0;
      result.scrollLeft = Math.max(0, x1 - 10 - gutterw);
    } else if (x2 > screenw + screenleft - 3) {
      result.scrollLeft = x2 + 10 - screenw;
    }
    return result;
  }

  function updateScrollPos(cm, left, top) {
    cm.curOp.updateScrollPos = {scrollLeft: left, scrollTop: top};
  }

  function addToScrollPos(cm, left, top) {
    var pos = cm.curOp.updateScrollPos || (cm.curOp.updateScrollPos = {scrollLeft: cm.doc.scrollLeft, scrollTop: cm.doc.scrollTop});
    pos.scrollTop += top;
    pos.scrollLeft += left;
  }

  // API UTILITIES

  function indentLine(cm, n, how, aggressive) {
    var doc = cm.doc;
    if (!how) how = "add";
    if (how == "smart") {
      if (!cm.doc.mode.indent) how = "prev";
      else var state = getStateBefore(cm, n);
    }

    var tabSize = cm.options.tabSize;
    var line = getLine(doc, n), curSpace = countColumn(line.text, null, tabSize);
    var curSpaceString = line.text.match(/^\s*/)[0], indentation;
    if (how == "smart") {
      indentation = cm.doc.mode.indent(state, line.text.slice(curSpaceString.length), line.text);
      if (indentation == Pass) {
        if (!aggressive) return;
        how = "prev";
      }
    }
    if (how == "prev") {
      if (n > doc.first) indentation = countColumn(getLine(doc, n-1).text, null, tabSize);
      else indentation = 0;
    } else if (how == "add") {
      indentation = curSpace + cm.options.indentUnit;
    } else if (how == "subtract") {
      indentation = curSpace - cm.options.indentUnit;
    }
    indentation = Math.max(0, indentation);

    var indentString = "", pos = 0;
    if (cm.options.indentWithTabs)
      for (var i = Math.floor(indentation / tabSize); i; --i) {pos += tabSize; indentString += "\t";}
    if (pos < indentation) indentString += spaceStr(indentation - pos);

    if (indentString != curSpaceString)
      replaceRange(cm.doc, indentString, Pos(n, 0), Pos(n, curSpaceString.length), "+input");
    line.stateAfter = null;
  }

  function changeLine(cm, handle, op) {
    var no = handle, line = handle, doc = cm.doc;
    if (typeof handle == "number") line = getLine(doc, clipLine(doc, handle));
    else no = lineNo(handle);
    if (no == null) return null;
    if (op(line, no)) regChange(cm, no, no + 1);
    else return null;
    return line;
  }

  function findPosH(doc, pos, dir, unit, visually) {
    var line = pos.line, ch = pos.ch;
    var lineObj = getLine(doc, line);
    var possible = true;
    function findNextLine() {
      var l = line + dir;
      if (l < doc.first || l >= doc.first + doc.size) return (possible = false);
      line = l;
      return lineObj = getLine(doc, l);
    }
    function moveOnce(boundToLine) {
      var next = (visually ? moveVisually : moveLogically)(lineObj, ch, dir, true);
      if (next == null) {
        if (!boundToLine && findNextLine()) {
          if (visually) ch = (dir < 0 ? lineRight : lineLeft)(lineObj);
          else ch = dir < 0 ? lineObj.text.length : 0;
        } else return (possible = false);
      } else ch = next;
      return true;
    }

    if (unit == "char") moveOnce();
    else if (unit == "column") moveOnce(true);
    else if (unit == "word") {
      var sawWord = false;
      for (;;) {
        if (dir < 0) if (!moveOnce()) break;
        if (isWordChar(lineObj.text.charAt(ch))) sawWord = true;
        else if (sawWord) {if (dir < 0) {dir = 1; moveOnce();} break;}
        if (dir > 0) if (!moveOnce()) break;
      }
    }
    var result = skipAtomic(doc, Pos(line, ch), dir, true);
    if (!possible) result.hitSide = true;
    return result;
  }

  function findPosV(cm, pos, dir, unit) {
    var doc = cm.doc, x = pos.left, y;
    if (unit == "page") {
      var pageSize = Math.min(cm.display.wrapper.clientHeight, window.innerHeight || document.documentElement.clientHeight);
      y = pos.top + dir * (pageSize - textHeight(cm.display));
    } else if (unit == "line") {
      y = dir > 0 ? pos.bottom + 3 : pos.top - 3;
    }
    for (;;) {
      var target = coordsChar(cm, x, y);
      if (!target.outside) break;
      if (dir < 0 ? y <= 0 : y >= doc.height) { target.hitSide = true; break; }
      y += dir * 5;
    }
    return target;
  }

  function findWordAt(line, pos) {
    var start = pos.ch, end = pos.ch;
    if (line) {
      if (pos.after === false || end == line.length) --start; else ++end;
      var startChar = line.charAt(start);
      var check = isWordChar(startChar) ? isWordChar :
        /\s/.test(startChar) ? function(ch) {return /\s/.test(ch);} :
      function(ch) {return !/\s/.test(ch) && !isWordChar(ch);};
      while (start > 0 && check(line.charAt(start - 1))) --start;
      while (end < line.length && check(line.charAt(end))) ++end;
    }
    return {from: Pos(pos.line, start), to: Pos(pos.line, end)};
  }

  function selectLine(cm, line) {
    extendSelection(cm.doc, Pos(line, 0), clipPos(cm.doc, Pos(line + 1, 0)));
  }

  // PROTOTYPE

  // The publicly visible API. Note that operation(null, f) means
  // 'wrap f in an operation, performed on its `this` parameter'

  CodeMirror.prototype = {
    focus: function(){window.focus(); focusInput(this); onFocus(this); fastPoll(this);},

    setOption: function(option, value) {
      var options = this.options, old = options[option];
      if (options[option] == value && option != "mode") return;
      options[option] = value;
      if (optionHandlers.hasOwnProperty(option))
        operation(this, optionHandlers[option])(this, value, old);
    },

    getOption: function(option) {return this.options[option];},
    getDoc: function() {return this.doc;},

    addKeyMap: function(map) {
      this.state.keyMaps.push(map);
    },
    removeKeyMap: function(map) {
      var maps = this.state.keyMaps;
      for (var i = 0; i < maps.length; ++i)
        if ((typeof map == "string" ? maps[i].name : maps[i]) == map) {
          maps.splice(i, 1);
          return true;
        }
    },

    addOverlay: operation(null, function(spec, options) {
      var mode = spec.token ? spec : CodeMirror.getMode(this.options, spec);
      if (mode.startState) throw new Error("Overlays may not be stateful.");
      this.state.overlays.push({mode: mode, modeSpec: spec, opaque: options && options.opaque});
      this.state.modeGen++;
      regChange(this);
    }),
    removeOverlay: operation(null, function(spec) {
      var overlays = this.state.overlays;
      for (var i = 0; i < overlays.length; ++i) {
        if (overlays[i].modeSpec == spec) {
          overlays.splice(i, 1);
          this.state.modeGen++;
          regChange(this);
          return;
        }
      }
    }),

    indentLine: operation(null, function(n, dir, aggressive) {
      if (typeof dir != "string") {
        if (dir == null) dir = this.options.smartIndent ? "smart" : "prev";
        else dir = dir ? "add" : "subtract";
      }
      if (isLine(this.doc, n)) indentLine(this, n, dir, aggressive);
    }),
    indentSelection: operation(null, function(how) {
      var sel = this.doc.sel;
      if (posEq(sel.from, sel.to)) return indentLine(this, sel.from.line, how);
      var e = sel.to.line - (sel.to.ch ? 0 : 1);
      for (var i = sel.from.line; i <= e; ++i) indentLine(this, i, how);
    }),

    // Fetch the parser token for a given character. Useful for hacks
    // that want to inspect the mode state (say, for completion).
    getTokenAt: function(pos) {
      var doc = this.doc;
      pos = clipPos(doc, pos);
      var state = getStateBefore(this, pos.line), mode = this.doc.mode;
      var line = getLine(doc, pos.line);
      var stream = new StringStream(line.text, this.options.tabSize);
      while (stream.pos < pos.ch && !stream.eol()) {
        stream.start = stream.pos;
        var style = mode.token(stream, state);
      }
      return {start: stream.start,
              end: stream.pos,
              string: stream.current(),
              className: style || null, // Deprecated, use 'type' instead
              type: style || null,
              state: state};
    },

    getStateAfter: function(line) {
      var doc = this.doc;
      line = clipLine(doc, line == null ? doc.first + doc.size - 1: line);
      return getStateBefore(this, line + 1);
    },

    cursorCoords: function(start, mode) {
      var pos, sel = this.doc.sel;
      if (start == null) pos = sel.head;
      else if (typeof start == "object") pos = clipPos(this.doc, start);
      else pos = start ? sel.from : sel.to;
      return cursorCoords(this, pos, mode || "page");
    },

    charCoords: function(pos, mode) {
      return charCoords(this, clipPos(this.doc, pos), mode || "page");
    },

    coordsChar: function(coords) {
      var off = getRect(this.display.lineSpace);
      var scrollY = window.pageYOffset || (document.documentElement || document.body).scrollTop;
      var scrollX = window.pageXOffset || (document.documentElement || document.body).scrollLeft;
      return coordsChar(this, coords.left - off.left - scrollX, coords.top - off.top - scrollY);
    },

    defaultTextHeight: function() { return textHeight(this.display); },

    setGutterMarker: operation(null, function(line, gutterID, value) {
      return changeLine(this, line, function(line) {
        var markers = line.gutterMarkers || (line.gutterMarkers = {});
        markers[gutterID] = value;
        if (!value && isEmpty(markers)) line.gutterMarkers = null;
        return true;
      });
    }),

    clearGutter: operation(null, function(gutterID) {
      var cm = this, doc = cm.doc, i = doc.first;
      doc.iter(function(line) {
        if (line.gutterMarkers && line.gutterMarkers[gutterID]) {
          line.gutterMarkers[gutterID] = null;
          regChange(cm, i, i + 1);
          if (isEmpty(line.gutterMarkers)) line.gutterMarkers = null;
        }
        ++i;
      });
    }),

    addLineClass: operation(null, function(handle, where, cls) {
      return changeLine(this, handle, function(line) {
        var prop = where == "text" ? "textClass" : where == "background" ? "bgClass" : "wrapClass";
        if (!line[prop]) line[prop] = cls;
        else if (new RegExp("\\b" + cls + "\\b").test(line[prop])) return false;
        else line[prop] += " " + cls;
        return true;
      });
    }),

    removeLineClass: operation(null, function(handle, where, cls) {
      return changeLine(this, handle, function(line) {
        var prop = where == "text" ? "textClass" : where == "background" ? "bgClass" : "wrapClass";
        var cur = line[prop];
        if (!cur) return false;
        else if (cls == null) line[prop] = null;
        else {
          var upd = cur.replace(new RegExp("^" + cls + "\\b\\s*|\\s*\\b" + cls + "\\b"), "");
          if (upd == cur) return false;
          line[prop] = upd || null;
        }
        return true;
      });
    }),

    addLineWidget: operation(null, function(handle, node, options) {
      return addLineWidget(this, handle, node, options);
    }),

    removeLineWidget: function(widget) { widget.clear(); },

    lineInfo: function(line) {
      if (typeof line == "number") {
        if (!isLine(this.doc, line)) return null;
        var n = line;
        line = getLine(this.doc, line);
        if (!line) return null;
      } else {
        var n = lineNo(line);
        if (n == null) return null;
      }
      return {line: n, handle: line, text: line.text, gutterMarkers: line.gutterMarkers,
              textClass: line.textClass, bgClass: line.bgClass, wrapClass: line.wrapClass,
              widgets: line.widgets};
    },

    getViewport: function() { return {from: this.display.showingFrom, to: this.display.showingTo};},

    addWidget: function(pos, node, scroll, vert, horiz) {
      var display = this.display;
      pos = cursorCoords(this, clipPos(this.doc, pos));
      var top = pos.bottom, left = pos.left;
      node.style.position = "absolute";
      display.sizer.appendChild(node);
      if (vert == "over") {
        top = pos.top;
      } else if (vert == "above" || vert == "near") {
        var vspace = Math.max(display.wrapper.clientHeight, this.doc.height),
        hspace = Math.max(display.sizer.clientWidth, display.lineSpace.clientWidth);
        // Default to positioning above (if specified and possible); otherwise default to positioning below
        if ((vert == 'above' || pos.bottom + node.offsetHeight > vspace) && pos.top > node.offsetHeight)
          top = pos.top - node.offsetHeight;
        else if (pos.bottom + node.offsetHeight <= vspace)
          top = pos.bottom;
        if (left + node.offsetWidth > hspace)
          left = hspace - node.offsetWidth;
      }
      node.style.top = (top + paddingTop(display)) + "px";
      node.style.left = node.style.right = "";
      if (horiz == "right") {
        left = display.sizer.clientWidth - node.offsetWidth;
        node.style.right = "0px";
      } else {
        if (horiz == "left") left = 0;
        else if (horiz == "middle") left = (display.sizer.clientWidth - node.offsetWidth) / 2;
        node.style.left = left + "px";
      }
      if (scroll)
        scrollIntoView(this, left, top, left + node.offsetWidth, top + node.offsetHeight);
    },

    triggerOnKeyDown: operation(null, onKeyDown),

    execCommand: function(cmd) {return commands[cmd](this);},

    findPosH: function(from, amount, unit, visually) {
      var dir = 1;
      if (amount < 0) { dir = -1; amount = -amount; }
      for (var i = 0, cur = clipPos(this.doc, from); i < amount; ++i) {
        cur = findPosH(this.doc, cur, dir, unit, visually);
        if (cur.hitSide) break;
      }
      return cur;
    },

    moveH: operation(null, function(dir, unit) {
      var sel = this.doc.sel, pos;
      if (sel.shift || sel.extend || posEq(sel.from, sel.to))
        pos = findPosH(this.doc, sel.head, dir, unit, this.options.rtlMoveVisually);
      else
        pos = dir < 0 ? sel.from : sel.to;
      extendSelection(this.doc, pos, pos, dir);
    }),

    deleteH: operation(null, function(dir, unit) {
      var sel = this.doc.sel;
      if (!posEq(sel.from, sel.to)) replaceRange(this.doc, "", sel.from, sel.to, "+delete");
      else replaceRange(this.doc, "", sel.from, findPosH(this.doc, sel.head, dir, unit, false), "+delete");
      this.curOp.userSelChange = true;
    }),

    findPosV: function(from, amount, unit, goalColumn) {
      var dir = 1, x = goalColumn;
      if (amount < 0) { dir = -1; amount = -amount; }
      for (var i = 0, cur = clipPos(this.doc, from); i < amount; ++i) {
        var coords = cursorCoords(this, cur, "div");
        if (x == null) x = coords.left;
        else coords.left = x;
        cur = findPosV(this, coords, dir, unit);
        if (cur.hitSide) break;
      }
      return cur;
    },

    moveV: operation(null, function(dir, unit) {
      var sel = this.doc.sel;
      var pos = cursorCoords(this, sel.head, "div");
      if (sel.goalColumn != null) pos.left = sel.goalColumn;
      var target = findPosV(this, pos, dir, unit);

      if (unit == "page") addToScrollPos(this, 0, charCoords(this, target, "div").top - pos.top);
      extendSelection(this.doc, target, target, dir);
      sel.goalColumn = pos.left;
    }),

    toggleOverwrite: function() {
      if (this.state.overwrite = !this.state.overwrite)
        this.display.cursor.className += " CodeMirror-overwrite";
      else
        this.display.cursor.className = this.display.cursor.className.replace(" CodeMirror-overwrite", "");
    },

    scrollTo: operation(null, function(x, y) {
      updateScrollPos(this, x, y);
    }),
    getScrollInfo: function() {
      var scroller = this.display.scroller, co = scrollerCutOff;
      return {left: scroller.scrollLeft, top: scroller.scrollTop,
              height: scroller.scrollHeight - co, width: scroller.scrollWidth - co,
              clientHeight: scroller.clientHeight - co, clientWidth: scroller.clientWidth - co};
    },

    scrollIntoView: function(pos) {
      if (typeof pos == "number") pos = Pos(pos, 0);
      if (!pos || pos.line != null) {
        pos = pos ? clipPos(this.doc, pos) : this.doc.sel.head;
        scrollPosIntoView(this, pos);
      } else {
        scrollIntoView(this, pos.left, pos.top, pos.right, pos.bottom);
      }
    },

    setSize: function(width, height) {
      function interpret(val) {
        return typeof val == "number" || /^\d+$/.test(String(val)) ? val + "px" : val;
      }
      if (width != null) this.display.wrapper.style.width = interpret(width);
      if (height != null) this.display.wrapper.style.height = interpret(height);
      this.refresh();
    },

    on: function(type, f) {on(this, type, f);},
    off: function(type, f) {off(this, type, f);},

    operation: function(f){return runInOp(this, f);},

    refresh: operation(null, function() {
      clearCaches(this);
      updateScrollPos(this, this.doc.scrollLeft, this.doc.scrollTop);
      regChange(this);
    }),

    swapDoc: operation(null, function(doc) {
      var old = this.doc;
      old.cm = null;
      attachDoc(this, doc);
      clearCaches(this);
      updateScrollPos(this, doc.scrollLeft, doc.scrollTop);
      return old;
    }),

    getInputField: function(){return this.display.input;},
    getWrapperElement: function(){return this.display.wrapper;},
    getScrollerElement: function(){return this.display.scroller;},
    getGutterElement: function(){return this.display.gutters;}
  };

  // OPTION DEFAULTS

  var optionHandlers = CodeMirror.optionHandlers = {};

  // The default configuration options.
  var defaults = CodeMirror.defaults = {};

  function option(name, deflt, handle, notOnInit) {
    CodeMirror.defaults[name] = deflt;
    if (handle) optionHandlers[name] =
      notOnInit ? function(cm, val, old) {if (old != Init) handle(cm, val, old);} : handle;
  }

  var Init = CodeMirror.Init = {toString: function(){return "CodeMirror.Init";}};

  // These two are, on init, called from the constructor because they
  // have to be initialized before the editor can start at all.
  option("value", "", function(cm, val) {
    cm.setValue(val);
  }, true);
  option("mode", null, function(cm, val) {
    cm.doc.modeOption = val;
    loadMode(cm);
  }, true);

  option("indentUnit", 2, loadMode, true);
  option("indentWithTabs", false);
  option("smartIndent", true);
  option("tabSize", 4, function(cm) {
    loadMode(cm);
    clearCaches(cm);
    regChange(cm);
  }, true);
  option("electricChars", true);
  option("rtlMoveVisually", !windows);

  option("theme", "default", function(cm) {
    themeChanged(cm);
    guttersChanged(cm);
  }, true);
  option("keyMap", "default", keyMapChanged);
  option("extraKeys", null);

  option("onKeyEvent", null);
  option("onDragEvent", null);

  option("lineWrapping", false, wrappingChanged, true);
  option("gutters", [], function(cm) {
    setGuttersForLineNumbers(cm.options);
    guttersChanged(cm);
  }, true);
  option("fixedGutter", true, function(cm, val) {
    cm.display.gutters.style.left = val ? compensateForHScroll(cm.display) + "px" : "0";
    cm.refresh();
  }, true);
  option("lineNumbers", false, function(cm) {
    setGuttersForLineNumbers(cm.options);
    guttersChanged(cm);
  }, true);
  option("firstLineNumber", 1, guttersChanged, true);
  option("lineNumberFormatter", function(integer) {return integer;}, guttersChanged, true);
  option("showCursorWhenSelecting", false, updateSelection, true);
  
  option("readOnly", false, function(cm, val) {
    if (val == "nocursor") {onBlur(cm); cm.display.input.blur();}
    else if (!val) resetInput(cm, true);
  });
  option("dragDrop", true);

  option("cursorBlinkRate", 530);
  option("cursorHeight", 1);
  option("workTime", 100);
  option("workDelay", 100);
  option("flattenSpans", true);
  option("pollInterval", 100);
  option("undoDepth", 40, function(cm, val){cm.doc.history.undoDepth = val;});
  option("viewportMargin", 10, function(cm){cm.refresh();}, true);

  option("tabindex", null, function(cm, val) {
    cm.display.input.tabIndex = val || "";
  });
  option("autofocus", null);

  // MODE DEFINITION AND QUERYING

  // Known modes, by name and by MIME
  var modes = CodeMirror.modes = {}, mimeModes = CodeMirror.mimeModes = {};

  CodeMirror.defineMode = function(name, mode) {
    if (!CodeMirror.defaults.mode && name != "null") CodeMirror.defaults.mode = name;
    if (arguments.length > 2) {
      mode.dependencies = [];
      for (var i = 2; i < arguments.length; ++i) mode.dependencies.push(arguments[i]);
    }
    modes[name] = mode;
  };

  CodeMirror.defineMIME = function(mime, spec) {
    mimeModes[mime] = spec;
  };

  CodeMirror.resolveMode = function(spec) {
    if (typeof spec == "string" && mimeModes.hasOwnProperty(spec))
      spec = mimeModes[spec];
    else if (typeof spec == "string" && /^[\w\-]+\/[\w\-]+\+xml$/.test(spec))
      return CodeMirror.resolveMode("application/xml");
    if (typeof spec == "string") return {name: spec};
    else return spec || {name: "null"};
  };

  CodeMirror.getMode = function(options, spec) {
    spec = CodeMirror.resolveMode(spec);
    var mfactory = modes[spec.name];
    if (!mfactory) return CodeMirror.getMode(options, "text/plain");
    var modeObj = mfactory(options, spec);
    if (modeExtensions.hasOwnProperty(spec.name)) {
      var exts = modeExtensions[spec.name];
      for (var prop in exts) {
        if (!exts.hasOwnProperty(prop)) continue;
        if (modeObj.hasOwnProperty(prop)) modeObj["_" + prop] = modeObj[prop];
        modeObj[prop] = exts[prop];
      }
    }
    modeObj.name = spec.name;
    return modeObj;
  };

  CodeMirror.defineMode("null", function() {
    return {token: function(stream) {stream.skipToEnd();}};
  });
  CodeMirror.defineMIME("text/plain", "null");

  var modeExtensions = CodeMirror.modeExtensions = {};
  CodeMirror.extendMode = function(mode, properties) {
    var exts = modeExtensions.hasOwnProperty(mode) ? modeExtensions[mode] : (modeExtensions[mode] = {});
    copyObj(properties, exts);
  };

  // EXTENSIONS

  CodeMirror.defineExtension = function(name, func) {
    CodeMirror.prototype[name] = func;
  };

  CodeMirror.defineOption = option;

  var initHooks = [];
  CodeMirror.defineInitHook = function(f) {initHooks.push(f);};

  // MODE STATE HANDLING

  // Utility functions for working with state. Exported because modes
  // sometimes need to do this.
  function copyState(mode, state) {
    if (state === true) return state;
    if (mode.copyState) return mode.copyState(state);
    var nstate = {};
    for (var n in state) {
      var val = state[n];
      if (val instanceof Array) val = val.concat([]);
      nstate[n] = val;
    }
    return nstate;
  }
  CodeMirror.copyState = copyState;

  function startState(mode, a1, a2) {
    return mode.startState ? mode.startState(a1, a2) : true;
  }
  CodeMirror.startState = startState;

  CodeMirror.innerMode = function(mode, state) {
    while (mode.innerMode) {
      var info = mode.innerMode(state);
      state = info.state;
      mode = info.mode;
    }
    return info || {mode: mode, state: state};
  };

  // STANDARD COMMANDS

  var commands = CodeMirror.commands = {
    selectAll: function(cm) {cm.setSelection(Pos(cm.firstLine(), 0), Pos(cm.lastLine()));},
    killLine: function(cm) {
      var from = cm.getCursor(true), to = cm.getCursor(false), sel = !posEq(from, to);
      if (!sel && cm.getLine(from.line).length == from.ch)
        cm.replaceRange("", from, Pos(from.line + 1, 0), "+delete");
      else cm.replaceRange("", from, sel ? to : Pos(from.line), "+delete");
    },
    deleteLine: function(cm) {
      var l = cm.getCursor().line;
      cm.replaceRange("", Pos(l, 0), Pos(l), "+delete");
    },
    undo: function(cm) {cm.undo();},
    redo: function(cm) {cm.redo();},
    goDocStart: function(cm) {cm.extendSelection(Pos(cm.firstLine(), 0));},
    goDocEnd: function(cm) {cm.extendSelection(Pos(cm.lastLine()));},
    goLineStart: function(cm) {
      cm.extendSelection(lineStart(cm, cm.getCursor().line));
    },
    goLineStartSmart: function(cm) {
      var cur = cm.getCursor(), start = lineStart(cm, cur.line);
      var line = cm.getLineHandle(start.line);
      var order = getOrder(line);
      if (!order || order[0].level == 0) {
        var firstNonWS = Math.max(0, line.text.search(/\S/));
        var inWS = cur.line == start.line && cur.ch <= firstNonWS && cur.ch;
        cm.extendSelection(Pos(start.line, inWS ? 0 : firstNonWS));
      } else cm.extendSelection(start);
    },
    goLineEnd: function(cm) {
      cm.extendSelection(lineEnd(cm, cm.getCursor().line));
    },
    goLineUp: function(cm) {cm.moveV(-1, "line");},
    goLineDown: function(cm) {cm.moveV(1, "line");},
    goPageUp: function(cm) {cm.moveV(-1, "page");},
    goPageDown: function(cm) {cm.moveV(1, "page");},
    goCharLeft: function(cm) {cm.moveH(-1, "char");},
    goCharRight: function(cm) {cm.moveH(1, "char");},
    goColumnLeft: function(cm) {cm.moveH(-1, "column");},
    goColumnRight: function(cm) {cm.moveH(1, "column");},
    goWordLeft: function(cm) {cm.moveH(-1, "word");},
    goWordRight: function(cm) {cm.moveH(1, "word");},
    delCharBefore: function(cm) {cm.deleteH(-1, "char");},
    delCharAfter: function(cm) {cm.deleteH(1, "char");},
    delWordBefore: function(cm) {cm.deleteH(-1, "word");},
    delWordAfter: function(cm) {cm.deleteH(1, "word");},
    indentAuto: function(cm) {cm.indentSelection("smart");},
    indentMore: function(cm) {cm.indentSelection("add");},
    indentLess: function(cm) {cm.indentSelection("subtract");},
    insertTab: function(cm) {cm.replaceSelection("\t", "end", "+input");},
    defaultTab: function(cm) {
      if (cm.somethingSelected()) cm.indentSelection("add");
      else cm.replaceSelection("\t", "end", "+input");
    },
    transposeChars: function(cm) {
      var cur = cm.getCursor(), line = cm.getLine(cur.line);
      if (cur.ch > 0 && cur.ch < line.length - 1)
        cm.replaceRange(line.charAt(cur.ch) + line.charAt(cur.ch - 1),
                        Pos(cur.line, cur.ch - 1), Pos(cur.line, cur.ch + 1));
    },
    newlineAndIndent: function(cm) {
      operation(cm, function() {
        cm.replaceSelection("\n", "end", "+input");
        cm.indentLine(cm.getCursor().line, null, true);
      })();
    },
    toggleOverwrite: function(cm) {cm.toggleOverwrite();}
  };

  // STANDARD KEYMAPS

  var keyMap = CodeMirror.keyMap = {};
  keyMap.basic = {
    "Left": "goCharLeft", "Right": "goCharRight", "Up": "goLineUp", "Down": "goLineDown",
    "End": "goLineEnd", "Home": "goLineStartSmart", "PageUp": "goPageUp", "PageDown": "goPageDown",
    "Delete": "delCharAfter", "Backspace": "delCharBefore", "Tab": "defaultTab", "Shift-Tab": "indentAuto",
    "Enter": "newlineAndIndent", "Insert": "toggleOverwrite"
  };
  // Note that the save and find-related commands aren't defined by
  // default. Unknown commands are simply ignored.
  keyMap.pcDefault = {
    "Ctrl-A": "selectAll", "Ctrl-D": "deleteLine", "Ctrl-Z": "undo", "Shift-Ctrl-Z": "redo", "Ctrl-Y": "redo",
    "Ctrl-Home": "goDocStart", "Alt-Up": "goDocStart", "Ctrl-End": "goDocEnd", "Ctrl-Down": "goDocEnd",
    "Ctrl-Left": "goWordLeft", "Ctrl-Right": "goWordRight", "Alt-Left": "goLineStart", "Alt-Right": "goLineEnd",
    "Ctrl-Backspace": "delWordBefore", "Ctrl-Delete": "delWordAfter", "Ctrl-S": "save", "Ctrl-F": "find",
    "Ctrl-G": "findNext", "Shift-Ctrl-G": "findPrev", "Shift-Ctrl-F": "replace", "Shift-Ctrl-R": "replaceAll",
    "Ctrl-[": "indentLess", "Ctrl-]": "indentMore",
    fallthrough: "basic"
  };
  keyMap.macDefault = {
    "Cmd-A": "selectAll", "Cmd-D": "deleteLine", "Cmd-Z": "undo", "Shift-Cmd-Z": "redo", "Cmd-Y": "redo",
    "Cmd-Up": "goDocStart", "Cmd-End": "goDocEnd", "Cmd-Down": "goDocEnd", "Alt-Left": "goWordLeft",
    "Alt-Right": "goWordRight", "Cmd-Left": "goLineStart", "Cmd-Right": "goLineEnd", "Alt-Backspace": "delWordBefore",
    "Ctrl-Alt-Backspace": "delWordAfter", "Alt-Delete": "delWordAfter", "Cmd-S": "save", "Cmd-F": "find",
    "Cmd-G": "findNext", "Shift-Cmd-G": "findPrev", "Cmd-Alt-F": "replace", "Shift-Cmd-Alt-F": "replaceAll",
    "Cmd-[": "indentLess", "Cmd-]": "indentMore",
    fallthrough: ["basic", "emacsy"]
  };
  keyMap["default"] = mac ? keyMap.macDefault : keyMap.pcDefault;
  keyMap.emacsy = {
    "Ctrl-F": "goCharRight", "Ctrl-B": "goCharLeft", "Ctrl-P": "goLineUp", "Ctrl-N": "goLineDown",
    "Alt-F": "goWordRight", "Alt-B": "goWordLeft", "Ctrl-A": "goLineStart", "Ctrl-E": "goLineEnd",
    "Ctrl-V": "goPageDown", "Shift-Ctrl-V": "goPageUp", "Ctrl-D": "delCharAfter", "Ctrl-H": "delCharBefore",
    "Alt-D": "delWordAfter", "Alt-Backspace": "delWordBefore", "Ctrl-K": "killLine", "Ctrl-T": "transposeChars"
  };

  // KEYMAP DISPATCH

  function getKeyMap(val) {
    if (typeof val == "string") return keyMap[val];
    else return val;
  }

  function lookupKey(name, maps, handle) {
    function lookup(map) {
      map = getKeyMap(map);
      var found = map[name];
      if (found === false) return "stop";
      if (found != null && handle(found)) return true;
      if (map.nofallthrough) return "stop";

      var fallthrough = map.fallthrough;
      if (fallthrough == null) return false;
      if (Object.prototype.toString.call(fallthrough) != "[object Array]")
        return lookup(fallthrough);
      for (var i = 0, e = fallthrough.length; i < e; ++i) {
        var done = lookup(fallthrough[i]);
        if (done) return done;
      }
      return false;
    }

    for (var i = 0; i < maps.length; ++i) {
      var done = lookup(maps[i]);
      if (done) return done;
    }
  }
  function isModifierKey(event) {
    var name = keyNames[event.keyCode];
    return name == "Ctrl" || name == "Alt" || name == "Shift" || name == "Mod";
  }
  function keyName(event, noShift) {
    var name = keyNames[event.keyCode];
    if (name == null || event.altGraphKey) return false;
    if (event.altKey) name = "Alt-" + name;
    if (flipCtrlCmd ? event.metaKey : event.ctrlKey) name = "Ctrl-" + name;
    if (flipCtrlCmd ? event.ctrlKey : event.metaKey) name = "Cmd-" + name;
    if (!noShift && event.shiftKey) name = "Shift-" + name;
    return name;
  }
  CodeMirror.lookupKey = lookupKey;
  CodeMirror.isModifierKey = isModifierKey;
  CodeMirror.keyName = keyName;

  // FROMTEXTAREA

  CodeMirror.fromTextArea = function(textarea, options) {
    if (!options) options = {};
    options.value = textarea.value;
    if (!options.tabindex && textarea.tabindex)
      options.tabindex = textarea.tabindex;
    // Set autofocus to true if this textarea is focused, or if it has
    // autofocus and no other element is focused.
    if (options.autofocus == null) {
      var hasFocus = document.body;
      // doc.activeElement occasionally throws on IE
      try { hasFocus = document.activeElement; } catch(e) {}
      options.autofocus = hasFocus == textarea ||
        textarea.getAttribute("autofocus") != null && hasFocus == document.body;
    }

    function save() {textarea.value = cm.getValue();}
    if (textarea.form) {
      // Deplorable hack to make the submit method do the right thing.
      on(textarea.form, "submit", save);
      var form = textarea.form, realSubmit = form.submit;
      try {
        var wrappedSubmit = form.submit = function() {
          save();
          form.submit = realSubmit;
          form.submit();
          form.submit = wrappedSubmit;
        };
      } catch(e) {}
    }

    textarea.style.display = "none";
    var cm = CodeMirror(function(node) {
      textarea.parentNode.insertBefore(node, textarea.nextSibling);
    }, options);
    cm.save = save;
    cm.getTextArea = function() { return textarea; };
    cm.toTextArea = function() {
      save();
      textarea.parentNode.removeChild(cm.getWrapperElement());
      textarea.style.display = "";
      if (textarea.form) {
        off(textarea.form, "submit", save);
        if (typeof textarea.form.submit == "function")
          textarea.form.submit = realSubmit;
      }
    };
    return cm;
  };

  // STRING STREAM

  // Fed to the mode parsers, provides helper functions to make
  // parsers more succinct.

  // The character stream used by a mode's parser.
  function StringStream(string, tabSize) {
    this.pos = this.start = 0;
    this.string = string;
    this.tabSize = tabSize || 8;
  }

  StringStream.prototype = {
    eol: function() {return this.pos >= this.string.length;},
    sol: function() {return this.pos == 0;},
    peek: function() {return this.string.charAt(this.pos) || undefined;},
    next: function() {
      if (this.pos < this.string.length)
        return this.string.charAt(this.pos++);
    },
    eat: function(match) {
      var ch = this.string.charAt(this.pos);
      if (typeof match == "string") var ok = ch == match;
      else var ok = ch && (match.test ? match.test(ch) : match(ch));
      if (ok) {++this.pos; return ch;}
    },
    eatWhile: function(match) {
      var start = this.pos;
      while (this.eat(match)){}
      return this.pos > start;
    },
    eatSpace: function() {
      var start = this.pos;
      while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) ++this.pos;
      return this.pos > start;
    },
    skipToEnd: function() {this.pos = this.string.length;},
    skipTo: function(ch) {
      var found = this.string.indexOf(ch, this.pos);
      if (found > -1) {this.pos = found; return true;}
    },
    backUp: function(n) {this.pos -= n;},
    column: function() {return countColumn(this.string, this.start, this.tabSize);},
    indentation: function() {return countColumn(this.string, null, this.tabSize);},
    match: function(pattern, consume, caseInsensitive) {
      if (typeof pattern == "string") {
        var cased = function(str) {return caseInsensitive ? str.toLowerCase() : str;};
        if (cased(this.string).indexOf(cased(pattern), this.pos) == this.pos) {
          if (consume !== false) this.pos += pattern.length;
          return true;
        }
      } else {
        var match = this.string.slice(this.pos).match(pattern);
        if (match && match.index > 0) return null;
        if (match && consume !== false) this.pos += match[0].length;
        return match;
      }
    },
    current: function(){return this.string.slice(this.start, this.pos);}
  };
  CodeMirror.StringStream = StringStream;

  // TEXTMARKERS

  function TextMarker(doc, type) {
    this.lines = [];
    this.type = type;
    this.doc = doc;
  }
  CodeMirror.TextMarker = TextMarker;

  TextMarker.prototype.clear = function() {
    if (this.explicitlyCleared) return;
    var cm = this.doc.cm, withOp = cm && !cm.curOp;
    if (withOp) startOperation(cm);
    var min = null, max = null;
    for (var i = 0; i < this.lines.length; ++i) {
      var line = this.lines[i];
      var span = getMarkedSpanFor(line.markedSpans, this);
      if (span.to != null) max = lineNo(line);
      line.markedSpans = removeMarkedSpan(line.markedSpans, span);
      if (span.from != null)
        min = lineNo(line);
      else if (this.collapsed && !lineIsHidden(this.doc, line) && cm)
        updateLineHeight(line, textHeight(cm.display));
    }
    if (cm && this.collapsed && !cm.options.lineWrapping) for (var i = 0; i < this.lines.length; ++i) {
      var visual = visualLine(cm.doc, this.lines[i]), len = lineLength(cm.doc, visual);
      if (len > cm.display.maxLineLength) {
        cm.display.maxLine = visual;
        cm.display.maxLineLength = len;
        cm.display.maxLineChanged = true;
      }
    }

    if (min != null && cm) regChange(cm, min, max + 1);
    this.lines.length = 0;
    this.explicitlyCleared = true;
    if (this.collapsed && this.doc.cantEdit) {
      this.doc.cantEdit = false;
      if (cm) reCheckSelection(cm);
    }
    if (withOp) endOperation(cm);
    signalLater(this, "clear");
  };

  TextMarker.prototype.find = function() {
    var from, to;
    for (var i = 0; i < this.lines.length; ++i) {
      var line = this.lines[i];
      var span = getMarkedSpanFor(line.markedSpans, this);
      if (span.from != null || span.to != null) {
        var found = lineNo(line);
        if (span.from != null) from = Pos(found, span.from);
        if (span.to != null) to = Pos(found, span.to);
      }
    }
    if (this.type == "bookmark") return from;
    return from && {from: from, to: to};
  };

  TextMarker.prototype.getOptions = function(copyWidget) {
    var repl = this.replacedWith;
    return {className: this.className,
            inclusiveLeft: this.inclusiveLeft, inclusiveRight: this.inclusiveRight,
            atomic: this.atomic,
            collapsed: this.collapsed,
            clearOnEnter: this.clearOnEnter,
            replacedWith: copyWidget ? repl && repl.cloneNode(true) : repl,
            readOnly: this.readOnly,
            startStyle: this.startStyle, endStyle: this.endStyle};
  };

  TextMarker.prototype.attachLine = function(line) {
    if (!this.lines.length && this.doc.cm) {
      var op = this.doc.cm.curOp;
      if (!op.maybeHiddenMarkers || indexOf(op.maybeHiddenMarkers, this) == -1)
        (op.maybeUnhiddenMarkers || (op.maybeUnhiddenMarkers = [])).push(this);
    }
    this.lines.push(line);
  };
  TextMarker.prototype.detachLine = function(line) {
    this.lines.splice(indexOf(this.lines, line), 1);
    if (!this.lines.length && this.doc.cm) {
      var op = this.doc.cm.curOp;
      (op.maybeHiddenMarkers || (op.maybeHiddenMarkers = [])).push(this);
    }
  };

  function markText(doc, from, to, options, type) {
    if (options && options.shared) return markTextShared(doc, from, to, options, type);
    if (doc.cm && !doc.cm.curOp) return operation(doc.cm, markText)(doc, from, to, options, type);

    var marker = new TextMarker(doc, type);
    if (type == "range" && !posLess(from, to)) return marker;
    if (options) copyObj(options, marker);
    if (marker.replacedWith) {
      marker.collapsed = true;
      marker.replacedWith = elt("span", [marker.replacedWith], "CodeMirror-widget");
    }
    if (marker.collapsed) sawCollapsedSpans = true;

    var curLine = from.line, size = 0, collapsedAtStart, collapsedAtEnd, cm = doc.cm, updateMaxLine;
    doc.iter(curLine, to.line + 1, function(line) {
      if (cm && marker.collapsed && !cm.options.lineWrapping && visualLine(doc, line) == cm.display.maxLine)
        updateMaxLine = true;
      var span = {from: null, to: null, marker: marker};
      size += line.text.length;
      if (curLine == from.line) {span.from = from.ch; size -= from.ch;}
      if (curLine == to.line) {span.to = to.ch; size -= line.text.length - to.ch;}
      if (marker.collapsed) {
        if (curLine == to.line) collapsedAtEnd = collapsedSpanAt(line, to.ch);
        if (curLine == from.line) collapsedAtStart = collapsedSpanAt(line, from.ch);
        else updateLineHeight(line, 0);
      }
      addMarkedSpan(line, span);
      ++curLine;
    });
    if (marker.collapsed) doc.iter(from.line, to.line + 1, function(line) {
      if (lineIsHidden(doc, line)) updateLineHeight(line, 0);
    });

    if (marker.readOnly) {
      sawReadOnlySpans = true;
      if (doc.history.done.length || doc.history.undone.length)
        doc.clearHistory();
    }
    if (marker.collapsed) {
      if (collapsedAtStart != collapsedAtEnd)
        throw new Error("Inserting collapsed marker overlapping an existing one");
      marker.size = size;
      marker.atomic = true;
    }
    if (cm) {
      if (updateMaxLine) cm.curOp.updateMaxLine = true;
      if (marker.className || marker.startStyle || marker.endStyle || marker.collapsed)
        regChange(cm, from.line, to.line + 1);
      if (marker.atomic) reCheckSelection(cm);
    }
    return marker;
  }

  // SHARED TEXTMARKERS

  function SharedTextMarker(markers, primary) {
    this.markers = markers;
    this.primary = primary;
    for (var i = 0, me = this; i < markers.length; ++i) {
      markers[i].parent = this;
      on(markers[i], "clear", function(){me.clear();});
    }
  }
  CodeMirror.SharedTextMarker = SharedTextMarker;

  SharedTextMarker.prototype.clear = function() {
    if (this.explicitlyCleared) return;
    this.explicitlyCleared = true;
    for (var i = 0; i < this.markers.length; ++i)
      this.markers[i].clear();
    signalLater(this, "clear");
  };
  SharedTextMarker.prototype.find = function() {
    return this.primary.find();
  };
  SharedTextMarker.prototype.getOptions = function(copyWidget) {
    var inner = this.primary.getOptions(copyWidget);
    inner.shared = true;
    return inner;
  };

  function markTextShared(doc, from, to, options, type) {
    options = copyObj(options);
    options.shared = false;
    var markers = [markText(doc, from, to, options, type)], primary = markers[0];
    linkedDocs(doc, function(doc) {
      markers.push(markText(doc, clipPos(doc, from), clipPos(doc, to), options, type));
      for (var i = 0; i < doc.linked.length; ++i)
        if (doc.linked[i].isParent) return;
      primary = lst(markers);
    });
    return new SharedTextMarker(markers, primary);
  }

  // TEXTMARKER SPANS

  function getMarkedSpanFor(spans, marker) {
    if (spans) for (var i = 0; i < spans.length; ++i) {
      var span = spans[i];
      if (span.marker == marker) return span;
    }
  }
  function removeMarkedSpan(spans, span) {
    for (var r, i = 0; i < spans.length; ++i)
      if (spans[i] != span) (r || (r = [])).push(spans[i]);
    return r;
  }
  function addMarkedSpan(line, span) {
    line.markedSpans = line.markedSpans ? line.markedSpans.concat([span]) : [span];
    span.marker.attachLine(line);
  }

  function markedSpansBefore(old, startCh, isInsert) {
    if (old) for (var i = 0, nw; i < old.length; ++i) {
      var span = old[i], marker = span.marker;
      var startsBefore = span.from == null || (marker.inclusiveLeft ? span.from <= startCh : span.from < startCh);
      if (startsBefore || marker.type == "bookmark" && span.from == startCh && (!isInsert || !span.marker.insertLeft)) {
        var endsAfter = span.to == null || (marker.inclusiveRight ? span.to >= startCh : span.to > startCh);
        (nw || (nw = [])).push({from: span.from,
                                to: endsAfter ? null : span.to,
                                marker: marker});
      }
    }
    return nw;
  }

  function markedSpansAfter(old, endCh, isInsert) {
    if (old) for (var i = 0, nw; i < old.length; ++i) {
      var span = old[i], marker = span.marker;
      var endsAfter = span.to == null || (marker.inclusiveRight ? span.to >= endCh : span.to > endCh);
      if (endsAfter || marker.type == "bookmark" && span.from == endCh && (!isInsert || span.marker.insertLeft)) {
        var startsBefore = span.from == null || (marker.inclusiveLeft ? span.from <= endCh : span.from < endCh);
        (nw || (nw = [])).push({from: startsBefore ? null : span.from - endCh,
                                to: span.to == null ? null : span.to - endCh,
                                marker: marker});
      }
    }
    return nw;
  }

  function stretchSpansOverChange(doc, change) {
    var oldFirst = isLine(doc, change.from.line) && getLine(doc, change.from.line).markedSpans;
    var oldLast = isLine(doc, change.to.line) && getLine(doc, change.to.line).markedSpans;
    if (!oldFirst && !oldLast) return null;

    var startCh = change.from.ch, endCh = change.to.ch, isInsert = posEq(change.from, change.to);
    // Get the spans that 'stick out' on both sides
    var first = markedSpansBefore(oldFirst, startCh, isInsert);
    var last = markedSpansAfter(oldLast, endCh, isInsert);

    // Next, merge those two ends
    var sameLine = change.text.length == 1, offset = lst(change.text).length + (sameLine ? startCh : 0);
    if (first) {
      // Fix up .to properties of first
      for (var i = 0; i < first.length; ++i) {
        var span = first[i];
        if (span.to == null) {
          var found = getMarkedSpanFor(last, span.marker);
          if (!found) span.to = startCh;
          else if (sameLine) span.to = found.to == null ? null : found.to + offset;
        }
      }
    }
    if (last) {
      // Fix up .from in last (or move them into first in case of sameLine)
      for (var i = 0; i < last.length; ++i) {
        var span = last[i];
        if (span.to != null) span.to += offset;
        if (span.from == null) {
          var found = getMarkedSpanFor(first, span.marker);
          if (!found) {
            span.from = offset;
            if (sameLine) (first || (first = [])).push(span);
          }
        } else {
          span.from += offset;
          if (sameLine) (first || (first = [])).push(span);
        }
      }
    }

    var newMarkers = [first];
    if (!sameLine) {
      // Fill gap with whole-line-spans
      var gap = change.text.length - 2, gapMarkers;
      if (gap > 0 && first)
        for (var i = 0; i < first.length; ++i)
          if (first[i].to == null)
            (gapMarkers || (gapMarkers = [])).push({from: null, to: null, marker: first[i].marker});
      for (var i = 0; i < gap; ++i)
        newMarkers.push(gapMarkers);
      newMarkers.push(last);
    }
    return newMarkers;
  }

  function mergeOldSpans(doc, change) {
    var old = getOldSpans(doc, change);
    var stretched = stretchSpansOverChange(doc, change);
    if (!old) return stretched;
    if (!stretched) return old;

    for (var i = 0; i < old.length; ++i) {
      var oldCur = old[i], stretchCur = stretched[i];
      if (oldCur && stretchCur) {
        spans: for (var j = 0; j < stretchCur.length; ++j) {
          var span = stretchCur[j];
          for (var k = 0; k < oldCur.length; ++k)
            if (oldCur[k].marker == span.marker) continue spans;
          oldCur.push(span);
        }
      } else if (stretchCur) {
        old[i] = stretchCur;
      }
    }
    return old;
  }

  function removeReadOnlyRanges(doc, from, to) {
    var markers = null;
    doc.iter(from.line, to.line + 1, function(line) {
      if (line.markedSpans) for (var i = 0; i < line.markedSpans.length; ++i) {
        var mark = line.markedSpans[i].marker;
        if (mark.readOnly && (!markers || indexOf(markers, mark) == -1))
          (markers || (markers = [])).push(mark);
      }
    });
    if (!markers) return null;
    var parts = [{from: from, to: to}];
    for (var i = 0; i < markers.length; ++i) {
      var mk = markers[i], m = mk.find();
      for (var j = 0; j < parts.length; ++j) {
        var p = parts[j];
        if (posLess(p.to, m.from) || posLess(m.to, p.from)) continue;
        var newParts = [j, 1];
        if (posLess(p.from, m.from) || !mk.inclusiveLeft && posEq(p.from, m.from))
          newParts.push({from: p.from, to: m.from});
        if (posLess(m.to, p.to) || !mk.inclusiveRight && posEq(p.to, m.to))
          newParts.push({from: m.to, to: p.to});
        parts.splice.apply(parts, newParts);
        j += newParts.length - 1;
      }
    }
    return parts;
  }

  function collapsedSpanAt(line, ch) {
    var sps = sawCollapsedSpans && line.markedSpans, found;
    if (sps) for (var sp, i = 0; i < sps.length; ++i) {
      sp = sps[i];
      if (!sp.marker.collapsed) continue;
      if ((sp.from == null || sp.from < ch) &&
          (sp.to == null || sp.to > ch) &&
          (!found || found.width < sp.marker.width))
        found = sp.marker;
    }
    return found;
  }
  function collapsedSpanAtStart(line) { return collapsedSpanAt(line, -1); }
  function collapsedSpanAtEnd(line) { return collapsedSpanAt(line, line.text.length + 1); }

  function visualLine(doc, line) {
    var merged;
    while (merged = collapsedSpanAtStart(line))
      line = getLine(doc, merged.find().from.line);
    return line;
  }

  function lineIsHidden(doc, line) {
    var sps = sawCollapsedSpans && line.markedSpans;
    if (sps) for (var sp, i = 0; i < sps.length; ++i) {
      sp = sps[i];
      if (!sp.marker.collapsed) continue;
      if (sp.from == null) return true;
      if (sp.from == 0 && sp.marker.inclusiveLeft && lineIsHiddenInner(doc, line, sp))
        return true;
    }
  }
  function lineIsHiddenInner(doc, line, span) {
    if (span.to == null) {
      var end = span.marker.find().to, endLine = getLine(doc, end.line);
      return lineIsHiddenInner(doc, endLine, getMarkedSpanFor(endLine.markedSpans, span.marker));
    }
    if (span.marker.inclusiveRight && span.to == line.text.length)
      return true;
    for (var sp, i = 0; i < line.markedSpans.length; ++i) {
      sp = line.markedSpans[i];
      if (sp.marker.collapsed && sp.from == span.to &&
          (sp.marker.inclusiveLeft || span.marker.inclusiveRight) &&
          lineIsHiddenInner(doc, line, sp)) return true;
    }
  }

  function detachMarkedSpans(line) {
    var spans = line.markedSpans;
    if (!spans) return;
    for (var i = 0; i < spans.length; ++i)
      spans[i].marker.detachLine(line);
    line.markedSpans = null;
  }

  function attachMarkedSpans(line, spans) {
    if (!spans) return;
    for (var i = 0; i < spans.length; ++i)
      spans[i].marker.attachLine(line);
    line.markedSpans = spans;
  }

  // LINE WIDGETS

  var LineWidget = CodeMirror.LineWidget = function(cm, node, options) {
    for (var opt in options) if (options.hasOwnProperty(opt))
      this[opt] = options[opt];
    this.cm = cm;
    this.node = node;
  };
  function widgetOperation(f) {
    return function() {
      var withOp = !this.cm.curOp;
      if (withOp) startOperation(this.cm);
      try {var result = f.apply(this, arguments);}
      finally {if (withOp) endOperation(this.cm);}
      return result;
    };
  }
  LineWidget.prototype.clear = widgetOperation(function() {
    var ws = this.line.widgets, no = lineNo(this.line);
    if (no == null || !ws) return;
    for (var i = 0; i < ws.length; ++i) if (ws[i] == this) ws.splice(i--, 1);
    if (!ws.length) this.line.widgets = null;
    updateLineHeight(this.line, Math.max(0, this.line.height - widgetHeight(this)));
    regChange(this.cm, no, no + 1);
  });
  LineWidget.prototype.changed = widgetOperation(function() {
    var oldH = this.height;
    this.height = null;
    var diff = widgetHeight(this) - oldH;
    if (!diff) return;
    updateLineHeight(this.line, this.line.height + diff);
    var no = lineNo(this.line);
    regChange(this.cm, no, no + 1);
  });

  function widgetHeight(widget) {
    if (widget.height != null) return widget.height;
    if (!widget.node.parentNode || widget.node.parentNode.nodeType != 1)
      removeChildrenAndAdd(widget.cm.display.measure, elt("div", [widget.node], null, "position: relative"));
    return widget.height = widget.node.offsetHeight;
  }

  function addLineWidget(cm, handle, node, options) {
    var widget = new LineWidget(cm, node, options);
    if (widget.noHScroll) cm.display.alignWidgets = true;
    changeLine(cm, handle, function(line) {
      (line.widgets || (line.widgets = [])).push(widget);
      widget.line = line;
      if (!lineIsHidden(cm.doc, line) || widget.showIfHidden) {
        var aboveVisible = heightAtLine(cm, line) < cm.display.scroller.scrollTop;
        updateLineHeight(line, line.height + widgetHeight(widget));
        if (aboveVisible) addToScrollPos(cm, 0, widget.height);
      }
      return true;
    });
    return widget;
  }

  // LINE DATA STRUCTURE

  // Line objects. These hold state related to a line, including
  // highlighting info (the styles array).
  function makeLine(text, markedSpans, estimateHeight) {
    var line = {text: text};
    attachMarkedSpans(line, markedSpans);
    line.height = estimateHeight ? estimateHeight(line) : 1;
    return line;
  }

  function updateLine(line, text, markedSpans, estimateHeight) {
    line.text = text;
    if (line.stateAfter) line.stateAfter = null;
    if (line.styles) line.styles = null;
    if (line.order != null) line.order = null;
    detachMarkedSpans(line);
    attachMarkedSpans(line, markedSpans);
    var estHeight = estimateHeight ? estimateHeight(line) : 1;
    if (estHeight != line.height) updateLineHeight(line, estHeight);
    signalLater(line, "change");
  }

  function cleanUpLine(line) {
    line.parent = null;
    detachMarkedSpans(line);
  }

  // Run the given mode's parser over a line, update the styles
  // array, which contains alternating fragments of text and CSS
  // classes.
  function runMode(cm, text, mode, state, f) {
    var flattenSpans = mode.flattenSpans;
    if (flattenSpans == null) flattenSpans = cm.options.flattenSpans;
    var curText = "", curStyle = null;
    var stream = new StringStream(text, cm.options.tabSize);
    if (text == "" && mode.blankLine) mode.blankLine(state);
    while (!stream.eol()) {
      var style = mode.token(stream, state);
      if (stream.pos > 5000) {
        flattenSpans = false;
        // Webkit seems to refuse to render text nodes longer than 57444 characters
        stream.pos = Math.min(text.length, stream.start + 50000);
        style = null;
      }
      var substr = stream.current();
      stream.start = stream.pos;
      if (!flattenSpans || curStyle != style) {
        if (curText) f(curText, curStyle);
        curText = substr; curStyle = style;
      } else curText = curText + substr;
    }
    if (curText) f(curText, curStyle);
  }

  function highlightLine(cm, line, state) {
    // A styles array always starts with a number identifying the
    // mode/overlays that it is based on (for easy invalidation).
    var st = [cm.state.modeGen];
    // Compute the base array of styles
    runMode(cm, line.text, cm.doc.mode, state, function(txt, style) {st.push(txt, style);});

    // Run overlays, adjust style array.
    for (var o = 0; o < cm.state.overlays.length; ++o) {
      var overlay = cm.state.overlays[o], i = 1;
      runMode(cm, line.text, overlay.mode, true, function(txt, style) {
        var start = i, len = txt.length;
        // Ensure there's a token end at the current position, and that i points at it
        while (len) {
          var cur = st[i], len_ = cur.length;
          if (len_ <= len) {
            len -= len_;
          } else {
            st.splice(i, 1, cur.slice(0, len), st[i+1], cur.slice(len));
            len = 0;
          }
          i += 2;
        }
        if (!style) return;
        if (overlay.opaque) {
          st.splice(start, i - start, txt, style);
          i = start + 2;
        } else {
          for (; start < i; start += 2) {
            var cur = st[start+1];
            st[start+1] = cur ? cur + " " + style : style;
          }
        }
      });
    }

    return st;
  }

  function getLineStyles(cm, line) {
    if (!line.styles || line.styles[0] != cm.state.modeGen)
      line.styles = highlightLine(cm, line, line.stateAfter = getStateBefore(cm, lineNo(line)));
    return line.styles;
  }

  // Lightweight form of highlight -- proceed over this line and
  // update state, but don't save a style array.
  function processLine(cm, line, state) {
    var mode = cm.doc.mode;
    var stream = new StringStream(line.text, cm.options.tabSize);
    if (line.text == "" && mode.blankLine) mode.blankLine(state);
    while (!stream.eol() && stream.pos <= 5000) {
      mode.token(stream, state);
      stream.start = stream.pos;
    }
  }

  var styleToClassCache = {};
  function styleToClass(style) {
    if (!style) return null;
    return styleToClassCache[style] ||
      (styleToClassCache[style] = "cm-" + style.replace(/ +/g, " cm-"));
  }

  function lineContent(cm, realLine, measure) {
    var merged, line = realLine, lineBefore, sawBefore, simple = true;
    while (merged = collapsedSpanAtStart(line)) {
      simple = false;
      line = getLine(cm.doc, merged.find().from.line);
      if (!lineBefore) lineBefore = line;
    }

    var builder = {pre: elt("pre"), col: 0, pos: 0, display: !measure,
                   measure: null, addedOne: false, cm: cm};
    if (line.textClass) builder.pre.className = line.textClass;

    do {
      builder.measure = line == realLine && measure;
      builder.pos = 0;
      builder.addToken = builder.measure ? buildTokenMeasure : buildToken;
      if (measure && sawBefore && line != realLine && !builder.addedOne) {
        measure[0] = builder.pre.appendChild(zeroWidthElement(cm.display.measure));
        builder.addedOne = true;
      }
      var next = insertLineContent(line, builder, getLineStyles(cm, line));
      sawBefore = line == lineBefore;
      if (next) {
        line = getLine(cm.doc, next.to.line);
        simple = false;
      }
    } while (next);

    if (measure && !builder.addedOne)
      measure[0] = builder.pre.appendChild(simple ? elt("span", "\u00a0") : zeroWidthElement(cm.display.measure));
    if (!builder.pre.firstChild && !lineIsHidden(cm.doc, realLine))
      builder.pre.appendChild(document.createTextNode("\u00a0"));

    var order;
    // Work around problem with the reported dimensions of single-char
    // direction spans on IE (issue #1129). See also the comment in
    // cursorCoords.
    if (measure && ie && (order = getOrder(line))) {
      var l = order.length - 1;
      if (order[l].from == order[l].to) --l;
      var last = order[l], prev = order[l - 1];
      if (last.from + 1 == last.to && prev && last.level < prev.level) {
        var span = measure[builder.pos - 1];
        if (span) span.parentNode.insertBefore(span.measureRight = zeroWidthElement(cm.display.measure),
                                               span.nextSibling);
      }
    }

    return builder.pre;
  }

  var tokenSpecialChars = /[\t\u0000-\u0019\u200b\u2028\u2029\uFEFF]/g;
  function buildToken(builder, text, style, startStyle, endStyle) {
    if (!text) return;
    if (!tokenSpecialChars.test(text)) {
      builder.col += text.length;
      var content = document.createTextNode(text);
    } else {
      var content = document.createDocumentFragment(), pos = 0;
      while (true) {
        tokenSpecialChars.lastIndex = pos;
        var m = tokenSpecialChars.exec(text);
        var skipped = m ? m.index - pos : text.length - pos;
        if (skipped) {
          content.appendChild(document.createTextNode(text.slice(pos, pos + skipped)));
          builder.col += skipped;
        }
        if (!m) break;
        pos += skipped + 1;
        if (m[0] == "\t") {
          var tabSize = builder.cm.options.tabSize, tabWidth = tabSize - builder.col % tabSize;
          content.appendChild(elt("span", spaceStr(tabWidth), "cm-tab"));
          builder.col += tabWidth;
        } else {
          var token = elt("span", "\u2022", "cm-invalidchar");
          token.title = "\\u" + m[0].charCodeAt(0).toString(16);
          content.appendChild(token);
          builder.col += 1;
        }
      }
    }
    if (style || startStyle || endStyle || builder.measure) {
      var fullStyle = style || "";
      if (startStyle) fullStyle += startStyle;
      if (endStyle) fullStyle += endStyle;
      return builder.pre.appendChild(elt("span", [content], fullStyle));
    }
    builder.pre.appendChild(content);
  }

  function buildTokenMeasure(builder, text, style, startStyle, endStyle) {
    var wrapping = builder.cm.options.lineWrapping;
    for (var i = 0; i < text.length; ++i) {
      var ch = text.charAt(i), start = i == 0;
      if (ch >= "\ud800" && ch < "\udbff" && i < text.length - 1) {
        ch = text.slice(i, i + 2);
        ++i;
      } else if (i && wrapping &&
                 spanAffectsWrapping.test(text.slice(i - 1, i + 1))) {
        builder.pre.appendChild(elt("wbr"));
      }
      var span = builder.measure[builder.pos] =
        buildToken(builder, ch, style,
                   start && startStyle, i == text.length - 1 && endStyle);
      // In IE single-space nodes wrap differently than spaces
      // embedded in larger text nodes, except when set to
      // white-space: normal (issue #1268).
      if (ie && wrapping && ch == " " && i && !/\s/.test(text.charAt(i - 1)) &&
          i < text.length - 1 && !/\s/.test(text.charAt(i + 1)))
        span.style.whiteSpace = "normal";
      builder.pos += ch.length;
    }
    if (text.length) builder.addedOne = true;
  }

  function buildCollapsedSpan(builder, size, widget) {
    if (widget) {
      if (!builder.display) widget = widget.cloneNode(true);
      builder.pre.appendChild(widget);
      if (builder.measure && size) {
        builder.measure[builder.pos] = widget;
        builder.addedOne = true;
      }
    }
    builder.pos += size;
  }

  // Outputs a number of spans to make up a line, taking highlighting
  // and marked text into account.
  function insertLineContent(line, builder, styles) {
    var spans = line.markedSpans;
    if (!spans) {
      for (var i = 1; i < styles.length; i+=2)
        builder.addToken(builder, styles[i], styleToClass(styles[i+1]));
      return;
    }

    var allText = line.text, len = allText.length;
    var pos = 0, i = 1, text = "", style;
    var nextChange = 0, spanStyle, spanEndStyle, spanStartStyle, collapsed;
    for (;;) {
      if (nextChange == pos) { // Update current marker set
        spanStyle = spanEndStyle = spanStartStyle = "";
        collapsed = null; nextChange = Infinity;
        var foundBookmark = null;
        for (var j = 0; j < spans.length; ++j) {
          var sp = spans[j], m = sp.marker;
          if (sp.from <= pos && (sp.to == null || sp.to > pos)) {
            if (sp.to != null && nextChange > sp.to) { nextChange = sp.to; spanEndStyle = ""; }
            if (m.className) spanStyle += " " + m.className;
            if (m.startStyle && sp.from == pos) spanStartStyle += " " + m.startStyle;
            if (m.endStyle && sp.to == nextChange) spanEndStyle += " " + m.endStyle;
            if (m.collapsed && (!collapsed || collapsed.marker.width < m.width))
              collapsed = sp;
          } else if (sp.from > pos && nextChange > sp.from) {
            nextChange = sp.from;
          }
          if (m.type == "bookmark" && sp.from == pos && m.replacedWith)
            foundBookmark = m.replacedWith;
        }
        if (collapsed && (collapsed.from || 0) == pos) {
          buildCollapsedSpan(builder, (collapsed.to == null ? len : collapsed.to) - pos,
                             collapsed.from != null && collapsed.marker.replacedWith);
          if (collapsed.to == null) return collapsed.marker.find();
        }
        if (foundBookmark && !collapsed) buildCollapsedSpan(builder, 0, foundBookmark);
      }
      if (pos >= len) break;

      var upto = Math.min(len, nextChange);
      while (true) {
        if (text) {
          var end = pos + text.length;
          if (!collapsed) {
            var tokenText = end > upto ? text.slice(0, upto - pos) : text;
            builder.addToken(builder, tokenText, style ? style + spanStyle : spanStyle,
                             spanStartStyle, pos + tokenText.length == nextChange ? spanEndStyle : "");
          }
          if (end >= upto) {text = text.slice(upto - pos); pos = upto; break;}
          pos = end;
          spanStartStyle = "";
        }
        text = styles[i++]; style = styleToClass(styles[i++]);
      }
    }
  }

  // DOCUMENT DATA STRUCTURE

  function updateDoc(doc, change, markedSpans, selAfter, estimateHeight) {
    function spansFor(n) {return markedSpans ? markedSpans[n] : null;}

    var from = change.from, to = change.to, text = change.text;
    var firstLine = getLine(doc, from.line), lastLine = getLine(doc, to.line);
    var lastText = lst(text), lastSpans = spansFor(text.length - 1), nlines = to.line - from.line;

    // First adjust the line structure
    if (from.ch == 0 && to.ch == 0 && lastText == "") {
      // This is a whole-line replace. Treated specially to make
      // sure line objects move the way they are supposed to.
      for (var i = 0, e = text.length - 1, added = []; i < e; ++i)
        added.push(makeLine(text[i], spansFor(i), estimateHeight));
      updateLine(lastLine, lastLine.text, lastSpans, estimateHeight);
      if (nlines) doc.remove(from.line, nlines);
      if (added.length) doc.insert(from.line, added);
    } else if (firstLine == lastLine) {
      if (text.length == 1) {
        updateLine(firstLine, firstLine.text.slice(0, from.ch) + lastText + firstLine.text.slice(to.ch),
                   lastSpans, estimateHeight);
      } else {
        for (var added = [], i = 1, e = text.length - 1; i < e; ++i)
          added.push(makeLine(text[i], spansFor(i), estimateHeight));
        added.push(makeLine(lastText + firstLine.text.slice(to.ch), lastSpans, estimateHeight));
        updateLine(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0), estimateHeight);
        doc.insert(from.line + 1, added);
      }
    } else if (text.length == 1) {
      updateLine(firstLine, firstLine.text.slice(0, from.ch) + text[0] + lastLine.text.slice(to.ch),
                 spansFor(0), estimateHeight);
      doc.remove(from.line + 1, nlines);
    } else {
      updateLine(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0), estimateHeight);
      updateLine(lastLine, lastText + lastLine.text.slice(to.ch), lastSpans, estimateHeight);
      for (var i = 1, e = text.length - 1, added = []; i < e; ++i)
        added.push(makeLine(text[i], spansFor(i), estimateHeight));
      if (nlines > 1) doc.remove(from.line + 1, nlines - 1);
      doc.insert(from.line + 1, added);
    }

    signalLater(doc, "change", doc, change);
    setSelection(doc, selAfter.anchor, selAfter.head, null, true);
  }

  function LeafChunk(lines) {
    this.lines = lines;
    this.parent = null;
    for (var i = 0, e = lines.length, height = 0; i < e; ++i) {
      lines[i].parent = this;
      height += lines[i].height;
    }
    this.height = height;
  }

  LeafChunk.prototype = {
    chunkSize: function() { return this.lines.length; },
    removeInner: function(at, n) {
      for (var i = at, e = at + n; i < e; ++i) {
        var line = this.lines[i];
        this.height -= line.height;
        cleanUpLine(line);
        signalLater(line, "delete");
      }
      this.lines.splice(at, n);
    },
    collapse: function(lines) {
      lines.splice.apply(lines, [lines.length, 0].concat(this.lines));
    },
    insertInner: function(at, lines, height) {
      this.height += height;
      this.lines = this.lines.slice(0, at).concat(lines).concat(this.lines.slice(at));
      for (var i = 0, e = lines.length; i < e; ++i) lines[i].parent = this;
    },
    iterN: function(at, n, op) {
      for (var e = at + n; at < e; ++at)
        if (op(this.lines[at])) return true;
    }
  };

  function BranchChunk(children) {
    this.children = children;
    var size = 0, height = 0;
    for (var i = 0, e = children.length; i < e; ++i) {
      var ch = children[i];
      size += ch.chunkSize(); height += ch.height;
      ch.parent = this;
    }
    this.size = size;
    this.height = height;
    this.parent = null;
  }

  BranchChunk.prototype = {
    chunkSize: function() { return this.size; },
    removeInner: function(at, n) {
      this.size -= n;
      for (var i = 0; i < this.children.length; ++i) {
        var child = this.children[i], sz = child.chunkSize();
        if (at < sz) {
          var rm = Math.min(n, sz - at), oldHeight = child.height;
          child.removeInner(at, rm);
          this.height -= oldHeight - child.height;
          if (sz == rm) { this.children.splice(i--, 1); child.parent = null; }
          if ((n -= rm) == 0) break;
          at = 0;
        } else at -= sz;
      }
      if (this.size - n < 25) {
        var lines = [];
        this.collapse(lines);
        this.children = [new LeafChunk(lines)];
        this.children[0].parent = this;
      }
    },
    collapse: function(lines) {
      for (var i = 0, e = this.children.length; i < e; ++i) this.children[i].collapse(lines);
    },
    insertInner: function(at, lines, height) {
      this.size += lines.length;
      this.height += height;
      for (var i = 0, e = this.children.length; i < e; ++i) {
        var child = this.children[i], sz = child.chunkSize();
        if (at <= sz) {
          child.insertInner(at, lines, height);
          if (child.lines && child.lines.length > 50) {
            while (child.lines.length > 50) {
              var spilled = child.lines.splice(child.lines.length - 25, 25);
              var newleaf = new LeafChunk(spilled);
              child.height -= newleaf.height;
              this.children.splice(i + 1, 0, newleaf);
              newleaf.parent = this;
            }
            this.maybeSpill();
          }
          break;
        }
        at -= sz;
      }
    },
    maybeSpill: function() {
      if (this.children.length <= 10) return;
      var me = this;
      do {
        var spilled = me.children.splice(me.children.length - 5, 5);
        var sibling = new BranchChunk(spilled);
        if (!me.parent) { // Become the parent node
          var copy = new BranchChunk(me.children);
          copy.parent = me;
          me.children = [copy, sibling];
          me = copy;
        } else {
          me.size -= sibling.size;
          me.height -= sibling.height;
          var myIndex = indexOf(me.parent.children, me);
          me.parent.children.splice(myIndex + 1, 0, sibling);
        }
        sibling.parent = me.parent;
      } while (me.children.length > 10);
      me.parent.maybeSpill();
    },
    iterN: function(at, n, op) {
      for (var i = 0, e = this.children.length; i < e; ++i) {
        var child = this.children[i], sz = child.chunkSize();
        if (at < sz) {
          var used = Math.min(n, sz - at);
          if (child.iterN(at, used, op)) return true;
          if ((n -= used) == 0) break;
          at = 0;
        } else at -= sz;
      }
    }
  };

  var nextDocId = 0;
  var Doc = CodeMirror.Doc = function(text, mode, firstLine) {
    if (!(this instanceof Doc)) return new Doc(text, mode, firstLine);
    if (firstLine == null) firstLine = 0;
    
    BranchChunk.call(this, [new LeafChunk([makeLine("", null)])]);
    this.first = firstLine;
    this.scrollTop = this.scrollLeft = 0;
    this.cantEdit = false;
    this.history = makeHistory();
    this.frontier = firstLine;
    var start = Pos(firstLine, 0);
    this.sel = {from: start, to: start, head: start, anchor: start, shift: false, extend: false, goalColumn: null};
    this.id = ++nextDocId;
    this.modeOption = mode;

    if (typeof text == "string") text = splitLines(text);
    updateDoc(this, {from: start, to: start, text: text}, null, {head: start, anchor: start});
  };

  Doc.prototype = createObj(BranchChunk.prototype, {
    iter: function(from, to, op) {
      if (op) this.iterN(from - this.first, to - from, op);
      else this.iterN(this.first, this.first + this.size, from);
    },

    insert: function(at, lines) {
      var height = 0;
      for (var i = 0, e = lines.length; i < e; ++i) height += lines[i].height;
      this.insertInner(at - this.first, lines, height);
    },
    remove: function(at, n) { this.removeInner(at - this.first, n); },

    getValue: function(lineSep) {
      var lines = getLines(this, this.first, this.first + this.size);
      if (lineSep === false) return lines;
      return lines.join(lineSep || "\n");
    },
    setValue: function(code) {
      var top = Pos(this.first, 0), last = this.first + this.size - 1;
      makeChange(this, {from: top, to: Pos(last, getLine(this, last).text.length),
                        text: splitLines(code), origin: "setValue"},
                 {head: top, anchor: top}, true);
    },
    replaceRange: function(code, from, to, origin) {
      from = clipPos(this, from);
      to = to ? clipPos(this, to) : from;
      replaceRange(this, code, from, to, origin);
    },
    getRange: function(from, to, lineSep) {
      var lines = getBetween(this, clipPos(this, from), clipPos(this, to));
      if (lineSep === false) return lines;
      return lines.join(lineSep || "\n");
    },

    getLine: function(line) {var l = this.getLineHandle(line); return l && l.text;},
    setLine: function(line, text) {
      if (isLine(this, line))
        replaceRange(this, text, Pos(line, 0), clipPos(this, Pos(line)));
    },
    removeLine: function(line) {
      if (isLine(this, line))
        replaceRange(this, "", Pos(line, 0), clipPos(this, Pos(line + 1, 0)));
    },

    getLineHandle: function(line) {if (isLine(this, line)) return getLine(this, line);},
    getLineNumber: function(line) {return lineNo(line);},

    lineCount: function() {return this.size;},
    firstLine: function() {return this.first;},
    lastLine: function() {return this.first + this.size - 1;},

    clipPos: function(pos) {return clipPos(this, pos);},

    getCursor: function(start) {
      var sel = this.sel, pos;
      if (start == null || start == "head") pos = sel.head;
      else if (start == "anchor") pos = sel.anchor;
      else if (start == "end" || start === false) pos = sel.to;
      else pos = sel.from;
      return copyPos(pos);
    },
    somethingSelected: function() {return !posEq(this.sel.head, this.sel.anchor);},

    setCursor: docOperation(function(line, ch, extend) {
      var pos = clipPos(this, typeof line == "number" ? Pos(line, ch || 0) : line);
      if (extend) extendSelection(this, pos);
      else setSelection(this, pos, pos);
    }),
    setSelection: docOperation(function(anchor, head) {
      setSelection(this, clipPos(this, anchor), clipPos(this, head || anchor));
    }),
    extendSelection: docOperation(function(from, to) {
      extendSelection(this, clipPos(this, from), to && clipPos(this, to));
    }),

    getSelection: function(lineSep) {return this.getRange(this.sel.from, this.sel.to, lineSep);},
    replaceSelection: function(code, collapse, origin) {
      makeChange(this, {from: this.sel.from, to: this.sel.to, text: splitLines(code), origin: origin}, collapse || "around");
    },
    undo: docOperation(function() {makeChangeFromHistory(this, "undo");}),
    redo: docOperation(function() {makeChangeFromHistory(this, "redo");}),

    setExtending: function(val) {this.sel.extend = val;},

    historySize: function() {
      var hist = this.history;
      return {undo: hist.done.length, redo: hist.undone.length};
    },
    clearHistory: function() {this.history = makeHistory();},

    markClean: function() {
      this.history.dirtyCounter = 0;
      this.history.lastOp = this.history.lastOrigin = null;
    },
    isClean: function () {return this.history.dirtyCounter == 0;},
      
    getHistory: function() {
      return {done: copyHistoryArray(this.history.done),
              undone: copyHistoryArray(this.history.undone)};
    },
    setHistory: function(histData) {
      var hist = this.history = makeHistory();
      hist.done = histData.done.slice(0);
      hist.undone = histData.undone.slice(0);
    },

    markText: function(from, to, options) {
      return markText(this, clipPos(this, from), clipPos(this, to), options, "range");
    },
    setBookmark: function(pos, options) {
      var realOpts = {replacedWith: options && (options.nodeType == null ? options.widget : options),
                      insertLeft: options && options.insertLeft};
      pos = clipPos(this, pos);
      return markText(this, pos, pos, realOpts, "bookmark");
    },
    findMarksAt: function(pos) {
      pos = clipPos(this, pos);
      var markers = [], spans = getLine(this, pos.line).markedSpans;
      if (spans) for (var i = 0; i < spans.length; ++i) {
        var span = spans[i];
        if ((span.from == null || span.from <= pos.ch) &&
            (span.to == null || span.to >= pos.ch))
          markers.push(span.marker.parent || span.marker);
      }
      return markers;
    },
    getAllMarks: function() {
      var markers = [];
      this.iter(function(line) {
        var sps = line.markedSpans;
        if (sps) for (var i = 0; i < sps.length; ++i)
          if (sps[i].from != null) markers.push(sps[i].marker);
      });
      return markers;
    },

    posFromIndex: function(off) {
      var ch, lineNo = this.first;
      this.iter(function(line) {
        var sz = line.text.length + 1;
        if (sz > off) { ch = off; return true; }
        off -= sz;
        ++lineNo;
      });
      return clipPos(this, Pos(lineNo, ch));
    },
    indexFromPos: function (coords) {
      coords = clipPos(this, coords);
      var index = coords.ch;
      if (coords.line < this.first || coords.ch < 0) return 0;
      this.iter(this.first, coords.line, function (line) {
        index += line.text.length + 1;
      });
      return index;
    },

    copy: function(copyHistory) {
      var doc = new Doc(getLines(this, this.first, this.first + this.size), this.modeOption, this.first);
      doc.scrollTop = this.scrollTop; doc.scrollLeft = this.scrollLeft;
      doc.sel = {from: this.sel.from, to: this.sel.to, head: this.sel.head, anchor: this.sel.anchor,
                 shift: this.sel.shift, extend: false, goalColumn: this.sel.goalColumn};
      if (copyHistory) {
        doc.history.undoDepth = this.history.undoDepth;
        doc.setHistory(this.getHistory());
      }
      return doc;
    },

    linkedDoc: function(options) {
      if (!options) options = {};
      var from = this.first, to = this.first + this.size;
      if (options.from != null && options.from > from) from = options.from;
      if (options.to != null && options.to < to) to = options.to;
      var copy = new Doc(getLines(this, from, to), options.mode || this.modeOption, from);
      if (options.sharedHist) copy.history = this.history;
      (this.linked || (this.linked = [])).push({doc: copy, sharedHist: options.sharedHist});
      copy.linked = [{doc: this, isParent: true, sharedHist: options.sharedHist}];
      return copy;
    },
    unlinkDoc: function(other) {
      if (other instanceof CodeMirror) other = other.doc;
      if (this.linked) for (var i = 0; i < this.linked.length; ++i) {
        var link = this.linked[i];
        if (link.doc != other) continue;
        this.linked.splice(i, 1);
        other.unlinkDoc(this);
        break;
      }
      // If the histories were shared, split them again
      if (other.history == this.history) {
        var splitIds = [other.id];
        linkedDocs(other, function(doc) {splitIds.push(doc.id);}, true);
        other.history = makeHistory();
        other.history.done = copyHistoryArray(this.history.done, splitIds);
        other.history.undone = copyHistoryArray(this.history.undone, splitIds);
      }
    },
    iterLinkedDocs: function(f) {linkedDocs(this, f);},

    getMode: function() {return this.mode;},
    getEditor: function() {return this.cm;}
  });

  Doc.prototype.eachLine = Doc.prototype.iter;

  // The Doc methods that should be available on CodeMirror instances
  var dontDelegate = "iter insert remove copy getEditor".split(" ");
  for (var prop in Doc.prototype) if (Doc.prototype.hasOwnProperty(prop) && indexOf(dontDelegate, prop) < 0)
    CodeMirror.prototype[prop] = (function(method) {
      return function() {return method.apply(this.doc, arguments);};
    })(Doc.prototype[prop]);

  function linkedDocs(doc, f, sharedHistOnly) {
    function propagate(doc, skip, sharedHist) {
      if (doc.linked) for (var i = 0; i < doc.linked.length; ++i) {
        var rel = doc.linked[i];
        if (rel.doc == skip) continue;
        var shared = sharedHist && rel.sharedHist;
        if (sharedHistOnly && !shared) continue;
        f(rel.doc, shared);
        propagate(rel.doc, doc, shared);
      }
    }
    propagate(doc, null, true);
  }

  function attachDoc(cm, doc) {
    if (doc.cm) throw new Error("This document is already in use.");
    cm.doc = doc;
    doc.cm = cm;
    estimateLineHeights(cm);
    loadMode(cm);
    if (!cm.options.lineWrapping) computeMaxLength(cm);
    cm.options.mode = doc.modeOption;
    regChange(cm);
  }

  // LINE UTILITIES

  function getLine(chunk, n) {
    n -= chunk.first;
    while (!chunk.lines) {
      for (var i = 0;; ++i) {
        var child = chunk.children[i], sz = child.chunkSize();
        if (n < sz) { chunk = child; break; }
        n -= sz;
      }
    }
    return chunk.lines[n];
  }

  function getBetween(doc, start, end) {
    var out = [], n = start.line;
    doc.iter(start.line, end.line + 1, function(line) {
      var text = line.text;
      if (n == end.line) text = text.slice(0, end.ch);
      if (n == start.line) text = text.slice(start.ch);
      out.push(text);
      ++n;
    });
    return out;
  }
  function getLines(doc, from, to) {
    var out = [];
    doc.iter(from, to, function(line) { out.push(line.text); });
    return out;
  }

  function updateLineHeight(line, height) {
    var diff = height - line.height;
    for (var n = line; n; n = n.parent) n.height += diff;
  }

  function lineNo(line) {
    if (line.parent == null) return null;
    var cur = line.parent, no = indexOf(cur.lines, line);
    for (var chunk = cur.parent; chunk; cur = chunk, chunk = chunk.parent) {
      for (var i = 0;; ++i) {
        if (chunk.children[i] == cur) break;
        no += chunk.children[i].chunkSize();
      }
    }
    return no + cur.first;
  }

  function lineAtHeight(chunk, h) {
    var n = chunk.first;
    outer: do {
      for (var i = 0, e = chunk.children.length; i < e; ++i) {
        var child = chunk.children[i], ch = child.height;
        if (h < ch) { chunk = child; continue outer; }
        h -= ch;
        n += child.chunkSize();
      }
      return n;
    } while (!chunk.lines);
    for (var i = 0, e = chunk.lines.length; i < e; ++i) {
      var line = chunk.lines[i], lh = line.height;
      if (h < lh) break;
      h -= lh;
    }
    return n + i;
  }

  function heightAtLine(cm, lineObj) {
    lineObj = visualLine(cm.doc, lineObj);

    var h = 0, chunk = lineObj.parent;
    for (var i = 0; i < chunk.lines.length; ++i) {
      var line = chunk.lines[i];
      if (line == lineObj) break;
      else h += line.height;
    }
    for (var p = chunk.parent; p; chunk = p, p = chunk.parent) {
      for (var i = 0; i < p.children.length; ++i) {
        var cur = p.children[i];
        if (cur == chunk) break;
        else h += cur.height;
      }
    }
    return h;
  }

  function getOrder(line) {
    var order = line.order;
    if (order == null) order = line.order = bidiOrdering(line.text);
    return order;
  }

  // HISTORY

  function makeHistory() {
    return {
      // Arrays of history events. Doing something adds an event to
      // done and clears undo. Undoing moves events from done to
      // undone, redoing moves them in the other direction.
      done: [], undone: [], undoDepth: Infinity,
      // Used to track when changes can be merged into a single undo
      // event
      lastTime: 0, lastOp: null, lastOrigin: null,
      // Used by the isClean() method
      dirtyCounter: 0
    };
  }

  function attachLocalSpans(doc, change, from, to) {
    var existing = change["spans_" + doc.id], n = 0;
    doc.iter(Math.max(doc.first, from), Math.min(doc.first + doc.size, to), function(line) {
      if (line.markedSpans)
        (existing || (existing = change["spans_" + doc.id] = {}))[n] = line.markedSpans;
      ++n;
    });
  }

  function historyChangeFromChange(doc, change) {
    var histChange = {from: change.from, to: changeEnd(change), text: getBetween(doc, change.from, change.to)};
    attachLocalSpans(doc, histChange, change.from.line, change.to.line + 1);
    linkedDocs(doc, function(doc) {attachLocalSpans(doc, histChange, change.from.line, change.to.line + 1);}, true);
    return histChange;
  }

  function addToHistory(doc, change, selAfter, opId) {
    var hist = doc.history;
    hist.undone.length = 0;
    var time = +new Date, cur = lst(hist.done);

    if (cur &&
        (hist.lastOp == opId ||
         hist.lastOrigin == change.origin && change.origin &&
         ((change.origin.charAt(0) == "+" && hist.lastTime > time - 600) || change.origin.charAt(0) == "*"))) {
      // Merge this change into the last event
      var last = lst(cur.changes);
      if (posEq(change.from, change.to) && posEq(change.from, last.to)) {
        // Optimized case for simple insertion -- don't want to add
        // new changesets for every character typed
        last.to = changeEnd(change);
      } else {
        // Add new sub-event
        cur.changes.push(historyChangeFromChange(doc, change));
      }
      cur.anchorAfter = selAfter.anchor; cur.headAfter = selAfter.head;
    } else {
      // Can not be merged, start a new event.
      cur = {changes: [historyChangeFromChange(doc, change)],
             anchorBefore: doc.sel.anchor, headBefore: doc.sel.head,
             anchorAfter: selAfter.anchor, headAfter: selAfter.head};
      hist.done.push(cur);
      while (hist.done.length > hist.undoDepth)
        hist.done.shift();
      if (hist.dirtyCounter < 0)
        // The user has made a change after undoing past the last clean state. 
        // We can never get back to a clean state now until markClean() is called.
        hist.dirtyCounter = NaN;
      else
        hist.dirtyCounter++;
    }
    hist.lastTime = time;
    hist.lastOp = opId;
    hist.lastOrigin = change.origin;
  }

  function removeClearedSpans(spans) {
    if (!spans) return null;
    for (var i = 0, out; i < spans.length; ++i) {
      if (spans[i].marker.explicitlyCleared) { if (!out) out = spans.slice(0, i); }
      else if (out) out.push(spans[i]);
    }
    return !out ? spans : out.length ? out : null;
  }

  function getOldSpans(doc, change) {
    var found = change["spans_" + doc.id];
    if (!found) return null;
    for (var i = 0, nw = []; i < change.text.length; ++i)
      nw.push(removeClearedSpans(found[i]));
    return nw;
  }

  // Used both to provide a JSON-safe object in .getHistory, and, when
  // detaching a document, to split the history in two
  function copyHistoryArray(events, newGroup) {
    for (var i = 0, copy = []; i < events.length; ++i) {
      var event = events[i], changes = event.changes, newChanges = [];
      copy.push({changes: newChanges, anchorBefore: event.anchorBefore, headBefore: event.headBefore,
                 anchorAfter: event.anchorAfter, headAfter: event.headAfter});
      for (var j = 0; j < changes.length; ++j) {
        var change = changes[j], m;
        newChanges.push({from: change.from, to: change.to, text: change.text});
        if (newGroup) for (var prop in change) if (m = prop.match(/^spans_(\d+)$/)) {
          if (indexOf(newGroup, Number(m[1])) > -1) {
            lst(newChanges)[prop] = change[prop];
            delete change[prop];
          }
        }
      }
    }
    return copy;
  }

  // Rebasing/resetting history to deal with externally-sourced changes

  function rebaseHistSel(pos, from, to, diff) {
    if (to < pos.line) {
      pos.line += diff;
    } else if (from < pos.line) {
      pos.line = from;
      pos.ch = 0;
    }
  }

  // Tries to rebase an array of history events given a change in the
  // document. If the change touches the same lines as the event, the
  // event, and everything 'behind' it, is discarded. If the change is
  // before the event, the event's positions are updated. Uses a
  // copy-on-write scheme for the positions, to avoid having to
  // reallocate them all on every rebase, but also avoid problems with
  // shared position objects being unsafely updated.
  function rebaseHistArray(array, from, to, diff) {
    for (var i = 0; i < array.length; ++i) {
      var sub = array[i], ok = true;
      for (var j = 0; j < sub.changes.length; ++j) {
        var cur = sub.changes[j];
        if (!sub.copied) { cur.from = copyPos(cur.from); cur.to = copyPos(cur.to); }
        if (to < cur.from.line) {
          cur.from.line += diff;
          cur.to.line += diff;
        } else if (from <= cur.to.line) {
          ok = false;
          break;
        }
      }
      if (!sub.copied) {
        sub.anchorBefore = copyPos(sub.anchorBefore); sub.headBefore = copyPos(sub.headBefore);
        sub.anchorAfter = copyPos(sub.anchorAfter); sub.readAfter = copyPos(sub.headAfter);
        sub.copied = true;
      }
      if (!ok) {
        array.splice(0, i + 1);
        i = 0;
      } else {
        rebaseHistSel(sub.anchorBefore); rebaseHistSel(sub.headBefore);
        rebaseHistSel(sub.anchorAfter); rebaseHistSel(sub.headAfter);
      }
    }
  }

  function rebaseHist(hist, change) {
    var from = change.from.line, to = change.to.line, diff = change.text.length - (to - from) - 1;
    rebaseHistArray(hist.done, from, to, diff);
    rebaseHistArray(hist.undone, from, to, diff);
  }

  // EVENT OPERATORS

  function stopMethod() {e_stop(this);}
  // Ensure an event has a stop method.
  function addStop(event) {
    if (!event.stop) event.stop = stopMethod;
    return event;
  }

  function e_preventDefault(e) {
    if (e.preventDefault) e.preventDefault();
    else e.returnValue = false;
  }
  function e_stopPropagation(e) {
    if (e.stopPropagation) e.stopPropagation();
    else e.cancelBubble = true;
  }
  function e_stop(e) {e_preventDefault(e); e_stopPropagation(e);}
  CodeMirror.e_stop = e_stop;
  CodeMirror.e_preventDefault = e_preventDefault;
  CodeMirror.e_stopPropagation = e_stopPropagation;

  function e_target(e) {return e.target || e.srcElement;}
  function e_button(e) {
    var b = e.which;
    if (b == null) {
      if (e.button & 1) b = 1;
      else if (e.button & 2) b = 3;
      else if (e.button & 4) b = 2;
    }
    if (mac && e.ctrlKey && b == 1) b = 3;
    return b;
  }

  // EVENT HANDLING

  function on(emitter, type, f) {
    if (emitter.addEventListener)
      emitter.addEventListener(type, f, false);
    else if (emitter.attachEvent)
      emitter.attachEvent("on" + type, f);
    else {
      var map = emitter._handlers || (emitter._handlers = {});
      var arr = map[type] || (map[type] = []);
      arr.push(f);
    }
  }

  function off(emitter, type, f) {
    if (emitter.removeEventListener)
      emitter.removeEventListener(type, f, false);
    else if (emitter.detachEvent)
      emitter.detachEvent("on" + type, f);
    else {
      var arr = emitter._handlers && emitter._handlers[type];
      if (!arr) return;
      for (var i = 0; i < arr.length; ++i)
        if (arr[i] == f) { arr.splice(i, 1); break; }
    }
  }

  function signal(emitter, type /*, values...*/) {
    var arr = emitter._handlers && emitter._handlers[type];
    if (!arr) return;
    var args = Array.prototype.slice.call(arguments, 2);
    for (var i = 0; i < arr.length; ++i) arr[i].apply(null, args);
  }

  var delayedCallbacks, delayedCallbackDepth = 0;
  function signalLater(emitter, type /*, values...*/) {
    var arr = emitter._handlers && emitter._handlers[type];
    if (!arr) return;
    var args = Array.prototype.slice.call(arguments, 2);
    if (!delayedCallbacks) {
      ++delayedCallbackDepth;
      delayedCallbacks = [];
      setTimeout(fireDelayed, 0);
    }
    function bnd(f) {return function(){f.apply(null, args);};};
    for (var i = 0; i < arr.length; ++i)
      delayedCallbacks.push(bnd(arr[i]));
  }

  function fireDelayed() {
    --delayedCallbackDepth;
    var delayed = delayedCallbacks;
    delayedCallbacks = null;
    for (var i = 0; i < delayed.length; ++i) delayed[i]();
  }

  function hasHandler(emitter, type) {
    var arr = emitter._handlers && emitter._handlers[type];
    return arr && arr.length > 0;
  }

  CodeMirror.on = on; CodeMirror.off = off; CodeMirror.signal = signal;

  // MISC UTILITIES

  // Number of pixels added to scroller and sizer to hide scrollbar
  var scrollerCutOff = 30;

  // Returned or thrown by various protocols to signal 'I'm not
  // handling this'.
  var Pass = CodeMirror.Pass = {toString: function(){return "CodeMirror.Pass";}};

  function Delayed() {this.id = null;}
  Delayed.prototype = {set: function(ms, f) {clearTimeout(this.id); this.id = setTimeout(f, ms);}};

  // Counts the column offset in a string, taking tabs into account.
  // Used mostly to find indentation.
  function countColumn(string, end, tabSize) {
    if (end == null) {
      end = string.search(/[^\s\u00a0]/);
      if (end == -1) end = string.length;
    }
    for (var i = 0, n = 0; i < end; ++i) {
      if (string.charAt(i) == "\t") n += tabSize - (n % tabSize);
      else ++n;
    }
    return n;
  }
  CodeMirror.countColumn = countColumn;

  var spaceStrs = [""];
  function spaceStr(n) {
    while (spaceStrs.length <= n)
      spaceStrs.push(lst(spaceStrs) + " ");
    return spaceStrs[n];
  }

  function lst(arr) { return arr[arr.length-1]; }

  function selectInput(node) {
    if (ios) { // Mobile Safari apparently has a bug where select() is broken.
      node.selectionStart = 0;
      node.selectionEnd = node.value.length;
    } else node.select();
  }

  function indexOf(collection, elt) {
    if (collection.indexOf) return collection.indexOf(elt);
    for (var i = 0, e = collection.length; i < e; ++i)
      if (collection[i] == elt) return i;
    return -1;
  }

  function createObj(base, props) {
    function Obj() {}
    Obj.prototype = base;
    var inst = new Obj();
    if (props) copyObj(props, inst);
    return inst;
  }

  function copyObj(obj, target) {
    if (!target) target = {};
    for (var prop in obj) if (obj.hasOwnProperty(prop)) target[prop] = obj[prop];
    return target;
  }

  function emptyArray(size) {
    for (var a = [], i = 0; i < size; ++i) a.push(undefined);
    return a;
  }

  function bind(f) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function(){return f.apply(null, args);};
  }

  var nonASCIISingleCaseWordChar = /[\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc]/;
  function isWordChar(ch) {
    return /\w/.test(ch) || ch > "\x80" &&
      (ch.toUpperCase() != ch.toLowerCase() || nonASCIISingleCaseWordChar.test(ch));
  }

  function isEmpty(obj) {
    for (var n in obj) if (obj.hasOwnProperty(n) && obj[n]) return false;
    return true;
  }

  var isExtendingChar = /[\u0300-\u036F\u0483-\u0487\u0488-\u0489\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED\uA66F\uA670-\uA672\uA674-\uA67D\uA69F\udc00-\udfff]/;

  // DOM UTILITIES

  function elt(tag, content, className, style) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (style) e.style.cssText = style;
    if (typeof content == "string") setTextContent(e, content);
    else if (content) for (var i = 0; i < content.length; ++i) e.appendChild(content[i]);
    return e;
  }

  function removeChildren(e) {
    // IE will break all parent-child relations in subnodes when setting innerHTML
    if (!ie) e.innerHTML = "";
    else while (e.firstChild) e.removeChild(e.firstChild);
    return e;
  }

  function removeChildrenAndAdd(parent, e) {
    return removeChildren(parent).appendChild(e);
  }

  function setTextContent(e, str) {
    if (ie_lt9) {
      e.innerHTML = "";
      e.appendChild(document.createTextNode(str));
    } else e.textContent = str;
  }

  function getRect(node) {
    return node.getBoundingClientRect();
  }
  CodeMirror.replaceGetRect = function(f) { getRect = f; };

  // FEATURE DETECTION

  // Detect drag-and-drop
  var dragAndDrop = function() {
    // There is *some* kind of drag-and-drop support in IE6-8, but I
    // couldn't get it to work yet.
    if (ie_lt9) return false;
    var div = elt('div');
    return "draggable" in div || "dragDrop" in div;
  }();

  // For a reason I have yet to figure out, some browsers disallow
  // word wrapping between certain characters *only* if a new inline
  // element is started between them. This makes it hard to reliably
  // measure the position of things, since that requires inserting an
  // extra span. This terribly fragile set of regexps matches the
  // character combinations that suffer from this phenomenon on the
  // various browsers.
  var spanAffectsWrapping = /^$/; // Won't match any two-character string
  if (gecko) spanAffectsWrapping = /$'/;
  else if (safari) spanAffectsWrapping = /\-[^ \-?]|\?[^ !'\"\),.\-\/:;\?\]\}]/;
  else if (chrome) spanAffectsWrapping = /\-[^ \-\.?]|\?[^ \-\.?\]\}:;!'\"\),\/]|[\.!\"#&%\)*+,:;=>\]|\}~][\(\{\[<]|\$'/;

  var knownScrollbarWidth;
  function scrollbarWidth(measure) {
    if (knownScrollbarWidth != null) return knownScrollbarWidth;
    var test = elt("div", null, null, "width: 50px; height: 50px; overflow-x: scroll");
    removeChildrenAndAdd(measure, test);
    if (test.offsetWidth)
      knownScrollbarWidth = test.offsetHeight - test.clientHeight;
    return knownScrollbarWidth || 0;
  }

  var zwspSupported;
  function zeroWidthElement(measure) {
    if (zwspSupported == null) {
      var test = elt("span", "\u200b");
      removeChildrenAndAdd(measure, elt("span", [test, document.createTextNode("x")]));
      if (measure.firstChild.offsetHeight != 0)
        zwspSupported = test.offsetWidth <= 1 && test.offsetHeight > 2 && !ie_lt8;
    }
    if (zwspSupported) return elt("span", "\u200b");
    else return elt("span", "\u00a0", null, "display: inline-block; width: 1px; margin-right: -1px");
  }

  // See if "".split is the broken IE version, if so, provide an
  // alternative way to split lines.
  var splitLines = "\n\nb".split(/\n/).length != 3 ? function(string) {
    var pos = 0, result = [], l = string.length;
    while (pos <= l) {
      var nl = string.indexOf("\n", pos);
      if (nl == -1) nl = string.length;
      var line = string.slice(pos, string.charAt(nl - 1) == "\r" ? nl - 1 : nl);
      var rt = line.indexOf("\r");
      if (rt != -1) {
        result.push(line.slice(0, rt));
        pos += rt + 1;
      } else {
        result.push(line);
        pos = nl + 1;
      }
    }
    return result;
  } : function(string){return string.split(/\r\n?|\n/);};
  CodeMirror.splitLines = splitLines;

  var hasSelection = window.getSelection ? function(te) {
    try { return te.selectionStart != te.selectionEnd; }
    catch(e) { return false; }
  } : function(te) {
    try {var range = te.ownerDocument.selection.createRange();}
    catch(e) {}
    if (!range || range.parentElement() != te) return false;
    return range.compareEndPoints("StartToEnd", range) != 0;
  };

  var hasCopyEvent = (function() {
    var e = elt("div");
    if ("oncopy" in e) return true;
    e.setAttribute("oncopy", "return;");
    return typeof e.oncopy == 'function';
  })();

  // KEY NAMING

  var keyNames = {3: "Enter", 8: "Backspace", 9: "Tab", 13: "Enter", 16: "Shift", 17: "Ctrl", 18: "Alt",
                  19: "Pause", 20: "CapsLock", 27: "Esc", 32: "Space", 33: "PageUp", 34: "PageDown", 35: "End",
                  36: "Home", 37: "Left", 38: "Up", 39: "Right", 40: "Down", 44: "PrintScrn", 45: "Insert",
                  46: "Delete", 59: ";", 91: "Mod", 92: "Mod", 93: "Mod", 109: "-", 107: "=", 127: "Delete",
                  186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[", 220: "\\",
                  221: "]", 222: "'", 63276: "PageUp", 63277: "PageDown", 63275: "End", 63273: "Home",
                  63234: "Left", 63232: "Up", 63235: "Right", 63233: "Down", 63302: "Insert", 63272: "Delete"};
  CodeMirror.keyNames = keyNames;
  (function() {
    // Number keys
    for (var i = 0; i < 10; i++) keyNames[i + 48] = String(i);
    // Alphabetic keys
    for (var i = 65; i <= 90; i++) keyNames[i] = String.fromCharCode(i);
    // Function keys
    for (var i = 1; i <= 12; i++) keyNames[i + 111] = keyNames[i + 63235] = "F" + i;
  })();

  // BIDI HELPERS

  function iterateBidiSections(order, from, to, f) {
    if (!order) return f(from, to, "ltr");
    for (var i = 0; i < order.length; ++i) {
      var part = order[i];
      if (part.from < to && part.to > from || from == to && part.to == from)
        f(Math.max(part.from, from), Math.min(part.to, to), part.level == 1 ? "rtl" : "ltr");
    }
  }

  function bidiLeft(part) { return part.level % 2 ? part.to : part.from; }
  function bidiRight(part) { return part.level % 2 ? part.from : part.to; }

  function lineLeft(line) { var order = getOrder(line); return order ? bidiLeft(order[0]) : 0; }
  function lineRight(line) {
    var order = getOrder(line);
    if (!order) return line.text.length;
    return bidiRight(lst(order));
  }

  function lineStart(cm, lineN) {
    var line = getLine(cm.doc, lineN);
    var visual = visualLine(cm.doc, line);
    if (visual != line) lineN = lineNo(visual);
    var order = getOrder(visual);
    var ch = !order ? 0 : order[0].level % 2 ? lineRight(visual) : lineLeft(visual);
    return Pos(lineN, ch);
  }
  function lineEnd(cm, lineN) {
    var merged, line;
    while (merged = collapsedSpanAtEnd(line = getLine(cm.doc, lineN)))
      lineN = merged.find().to.line;
    var order = getOrder(line);
    var ch = !order ? line.text.length : order[0].level % 2 ? lineLeft(line) : lineRight(line);
    return Pos(lineN, ch);
  }

  // This is somewhat involved. It is needed in order to move
  // 'visually' through bi-directional text -- i.e., pressing left
  // should make the cursor go left, even when in RTL text. The
  // tricky part is the 'jumps', where RTL and LTR text touch each
  // other. This often requires the cursor offset to move more than
  // one unit, in order to visually move one unit.
  function moveVisually(line, start, dir, byUnit) {
    var bidi = getOrder(line);
    if (!bidi) return moveLogically(line, start, dir, byUnit);
    var moveOneUnit = byUnit ? function(pos, dir) {
      do pos += dir;
      while (pos > 0 && isExtendingChar.test(line.text.charAt(pos)));
      return pos;
    } : function(pos, dir) { return pos + dir; };
    var linedir = bidi[0].level;
    for (var i = 0; i < bidi.length; ++i) {
      var part = bidi[i], sticky = part.level % 2 == linedir;
      if ((part.from < start && part.to > start) ||
          (sticky && (part.from == start || part.to == start))) break;
    }
    var target = moveOneUnit(start, part.level % 2 ? -dir : dir);

    while (target != null) {
      if (part.level % 2 == linedir) {
        if (target < part.from || target > part.to) {
          part = bidi[i += dir];
          target = part && (dir > 0 == part.level % 2 ? moveOneUnit(part.to, -1) : moveOneUnit(part.from, 1));
        } else break;
      } else {
        if (target == bidiLeft(part)) {
          part = bidi[--i];
          target = part && bidiRight(part);
        } else if (target == bidiRight(part)) {
          part = bidi[++i];
          target = part && bidiLeft(part);
        } else break;
      }
    }

    return target < 0 || target > line.text.length ? null : target;
  }

  function moveLogically(line, start, dir, byUnit) {
    var target = start + dir;
    if (byUnit) while (target > 0 && isExtendingChar.test(line.text.charAt(target))) target += dir;
    return target < 0 || target > line.text.length ? null : target;
  }

  // Bidirectional ordering algorithm
  // See http://unicode.org/reports/tr9/tr9-13.html for the algorithm
  // that this (partially) implements.

  // One-char codes used for character types:
  // L (L):   Left-to-Right
  // R (R):   Right-to-Left
  // r (AL):  Right-to-Left Arabic
  // 1 (EN):  European Number
  // + (ES):  European Number Separator
  // % (ET):  European Number Terminator
  // n (AN):  Arabic Number
  // , (CS):  Common Number Separator
  // m (NSM): Non-Spacing Mark
  // b (BN):  Boundary Neutral
  // s (B):   Paragraph Separator
  // t (S):   Segment Separator
  // w (WS):  Whitespace
  // N (ON):  Other Neutrals

  // Returns null if characters are ordered as they appear
  // (left-to-right), or an array of sections ({from, to, level}
  // objects) in the order in which they occur visually.
  var bidiOrdering = (function() {
    // Character types for codepoints 0 to 0xff
    var lowTypes = "bbbbbbbbbtstwsbbbbbbbbbbbbbbssstwNN%%%NNNNNN,N,N1111111111NNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNbbbbbbsbbbbbbbbbbbbbbbbbbbbbbbbbb,N%%%%NNNNLNNNNN%%11NLNNN1LNNNNNLLLLLLLLLLLLLLLLLLLLLLLNLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLNLLLLLLLL";
    // Character types for codepoints 0x600 to 0x6ff
    var arabicTypes = "rrrrrrrrrrrr,rNNmmmmmmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmmmmmmmmrrrrrrrnnnnnnnnnn%nnrrrmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmmmmmmmmmmmmmNmmmmrrrrrrrrrrrrrrrrrr";
    function charType(code) {
      if (code <= 0xff) return lowTypes.charAt(code);
      else if (0x590 <= code && code <= 0x5f4) return "R";
      else if (0x600 <= code && code <= 0x6ff) return arabicTypes.charAt(code - 0x600);
      else if (0x700 <= code && code <= 0x8ac) return "r";
      else return "L";
    }

    var bidiRE = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/;
    var isNeutral = /[stwN]/, isStrong = /[LRr]/, countsAsLeft = /[Lb1n]/, countsAsNum = /[1n]/;
    // Browsers seem to always treat the boundaries of block elements as being L.
    var outerType = "L";

    return function(str) {
      if (!bidiRE.test(str)) return false;
      var len = str.length, types = [];
      for (var i = 0, type; i < len; ++i)
        types.push(type = charType(str.charCodeAt(i)));

      // W1. Examine each non-spacing mark (NSM) in the level run, and
      // change the type of the NSM to the type of the previous
      // character. If the NSM is at the start of the level run, it will
      // get the type of sor.
      for (var i = 0, prev = outerType; i < len; ++i) {
        var type = types[i];
        if (type == "m") types[i] = prev;
        else prev = type;
      }

      // W2. Search backwards from each instance of a European number
      // until the first strong type (R, L, AL, or sor) is found. If an
      // AL is found, change the type of the European number to Arabic
      // number.
      // W3. Change all ALs to R.
      for (var i = 0, cur = outerType; i < len; ++i) {
        var type = types[i];
        if (type == "1" && cur == "r") types[i] = "n";
        else if (isStrong.test(type)) { cur = type; if (type == "r") types[i] = "R"; }
      }

      // W4. A single European separator between two European numbers
      // changes to a European number. A single common separator between
      // two numbers of the same type changes to that type.
      for (var i = 1, prev = types[0]; i < len - 1; ++i) {
        var type = types[i];
        if (type == "+" && prev == "1" && types[i+1] == "1") types[i] = "1";
        else if (type == "," && prev == types[i+1] &&
                 (prev == "1" || prev == "n")) types[i] = prev;
        prev = type;
      }

      // W5. A sequence of European terminators adjacent to European
      // numbers changes to all European numbers.
      // W6. Otherwise, separators and terminators change to Other
      // Neutral.
      for (var i = 0; i < len; ++i) {
        var type = types[i];
        if (type == ",") types[i] = "N";
        else if (type == "%") {
          for (var end = i + 1; end < len && types[end] == "%"; ++end) {}
          var replace = (i && types[i-1] == "!") || (end < len - 1 && types[end] == "1") ? "1" : "N";
          for (var j = i; j < end; ++j) types[j] = replace;
          i = end - 1;
        }
      }

      // W7. Search backwards from each instance of a European number
      // until the first strong type (R, L, or sor) is found. If an L is
      // found, then change the type of the European number to L.
      for (var i = 0, cur = outerType; i < len; ++i) {
        var type = types[i];
        if (cur == "L" && type == "1") types[i] = "L";
        else if (isStrong.test(type)) cur = type;
      }

      // N1. A sequence of neutrals takes the direction of the
      // surrounding strong text if the text on both sides has the same
      // direction. European and Arabic numbers act as if they were R in
      // terms of their influence on neutrals. Start-of-level-run (sor)
      // and end-of-level-run (eor) are used at level run boundaries.
      // N2. Any remaining neutrals take the embedding direction.
      for (var i = 0; i < len; ++i) {
        if (isNeutral.test(types[i])) {
          for (var end = i + 1; end < len && isNeutral.test(types[end]); ++end) {}
          var before = (i ? types[i-1] : outerType) == "L";
          var after = (end < len - 1 ? types[end] : outerType) == "L";
          var replace = before || after ? "L" : "R";
          for (var j = i; j < end; ++j) types[j] = replace;
          i = end - 1;
        }
      }

      // Here we depart from the documented algorithm, in order to avoid
      // building up an actual levels array. Since there are only three
      // levels (0, 1, 2) in an implementation that doesn't take
      // explicit embedding into account, we can build up the order on
      // the fly, without following the level-based algorithm.
      var order = [], m;
      for (var i = 0; i < len;) {
        if (countsAsLeft.test(types[i])) {
          var start = i;
          for (++i; i < len && countsAsLeft.test(types[i]); ++i) {}
          order.push({from: start, to: i, level: 0});
        } else {
          var pos = i, at = order.length;
          for (++i; i < len && types[i] != "L"; ++i) {}
          for (var j = pos; j < i;) {
            if (countsAsNum.test(types[j])) {
              if (pos < j) order.splice(at, 0, {from: pos, to: j, level: 1});
              var nstart = j;
              for (++j; j < i && countsAsNum.test(types[j]); ++j) {}
              order.splice(at, 0, {from: nstart, to: j, level: 2});
              pos = j;
            } else ++j;
          }
          if (pos < i) order.splice(at, 0, {from: pos, to: i, level: 1});
        }
      }
      if (order[0].level == 1 && (m = str.match(/^\s+/))) {
        order[0].from = m[0].length;
        order.unshift({from: 0, to: m[0].length, level: 0});
      }
      if (lst(order).level == 1 && (m = str.match(/\s+$/))) {
        lst(order).to -= m[0].length;
        order.push({from: len - m[0].length, to: len, level: 0});
      }
      if (order[0].level != lst(order).level)
        order.push({from: len, to: len, level: order[0].level});

      return order;
    };
  })();

  // THE END

  CodeMirror.version = "3.1 +";

  return CodeMirror;
})();

define("codemirror", function(){});

define('lib/createEditor',['jquery', 'codemirror'], function($){

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
//     keymaster.js
//     (c) 2011-2012 Thomas Fuchs
//     keymaster.js may be freely distributed under the MIT license.

;(function(global){
  var k,
    _handlers = {},
    _mods = { 16: false, 18: false, 17: false, 91: false },
    _scope = 'all',
    // modifier keys
    _MODIFIERS = {
      '⇧': 16, shift: 16,
      '⌥': 18, alt: 18, option: 18,
      '⌃': 17, ctrl: 17, control: 17,
      '⌘': 91, command: 91
    },
    // special keys
    _MAP = {
      backspace: 8, tab: 9, clear: 12,
      enter: 13, 'return': 13,
      esc: 27, escape: 27, space: 32,
      left: 37, up: 38,
      right: 39, down: 40,
      del: 46, 'delete': 46,
      home: 36, end: 35,
      pageup: 33, pagedown: 34,
      ',': 188, '.': 190, '/': 191,
      '`': 192, '-': 189, '=': 187,
      ';': 186, '\'': 222,
      '[': 219, ']': 221, '\\': 220
    },
    code = function(x){
      return _MAP[x] || x.toUpperCase().charCodeAt(0);
    },
    _downKeys = [];

  for(k=1;k<20;k++) _MODIFIERS['f'+k] = 111+k;

  // IE doesn't support Array#indexOf, so have a simple replacement
  function index(array, item){
    var i = array.length;
    while(i--) if(array[i]===item) return i;
    return -1;
  }

  var modifierMap = {
      16:'shiftKey',
      18:'altKey',
      17:'ctrlKey',
      91:'metaKey'
  };
  function updateModifierKey(event) {
      for(k in _mods) _mods[k] = event[modifierMap[k]];
  };

  // handle keydown event
  function dispatch(event, scope){
    var key, handler, k, i, modifiersMatch;
    key = event.keyCode;

    if (index(_downKeys, key) == -1) {
        _downKeys.push(key);
    }

    // if a modifier key, set the key.<modifierkeyname> property to true and return
    if(key == 93 || key == 224) key = 91; // right command on webkit, command on Gecko
    if(key in _mods) {
      _mods[key] = true;
      // 'assignKey' from inside this closure is exported to window.key
      for(k in _MODIFIERS) if(_MODIFIERS[k] == key) assignKey[k] = true;
      return;
    }
    updateModifierKey(event);

    // see if we need to ignore the keypress (filter() can can be overridden)
    // by default ignore key presses if a select, textarea, or input is focused
    if(!assignKey.filter.call(this, event)) return;

    // abort if no potentially matching shortcuts found
    if (!(key in _handlers)) return;

    // for each potential shortcut
    for (i = 0; i < _handlers[key].length; i++) {
      handler = _handlers[key][i];

      // see if it's in the current scope
      if(handler.scope == scope || handler.scope == 'all'){
        // check if modifiers match if any
        modifiersMatch = handler.mods.length > 0;
        for(k in _mods)
          if((!_mods[k] && index(handler.mods, +k) > -1) ||
            (_mods[k] && index(handler.mods, +k) == -1)) modifiersMatch = false;
        // call the handler and stop the event if neccessary
        if((handler.mods.length == 0 && !_mods[16] && !_mods[18] && !_mods[17] && !_mods[91]) || modifiersMatch){
          if(handler.method(event, handler)===false){
            if(event.preventDefault) event.preventDefault();
              else event.returnValue = false;
            if(event.stopPropagation) event.stopPropagation();
            if(event.cancelBubble) event.cancelBubble = true;
          }
        }
      }
    }
  };

  // unset modifier keys on keyup
  function clearModifier(event){
    var key = event.keyCode, k,
        i = index(_downKeys, key);

    // remove key from _downKeys
    if (i >= 0) {
        _downKeys.splice(i, 1);
    }

    if(key == 93 || key == 224) key = 91;
    if(key in _mods) {
      _mods[key] = false;
      for(k in _MODIFIERS) if(_MODIFIERS[k] == key) assignKey[k] = false;
    }
  };

  function resetModifiers() {
    for(k in _mods) _mods[k] = false;
    for(k in _MODIFIERS) assignKey[k] = false;
  }

  // parse and assign shortcut
  function assignKey(key, scope, method){
    var keys, mods, i, mi;
    if (method === undefined) {
      method = scope;
      scope = 'all';
    }
    key = key.replace(/\s/g,'');
    keys = key.split(',');

    if((keys[keys.length-1])=='')
      keys[keys.length-2] += ',';
    // for each shortcut
    for (i = 0; i < keys.length; i++) {
      // set modifier keys if any
      mods = [];
      key = keys[i].split('+');
      if(key.length > 1){
        mods = key.slice(0,key.length-1);
        for (mi = 0; mi < mods.length; mi++)
          mods[mi] = _MODIFIERS[mods[mi]];
        key = [key[key.length-1]];
      }
      // convert to keycode and...
      key = key[0]
      key = code(key);
      // ...store handler
      if (!(key in _handlers)) _handlers[key] = [];
      _handlers[key].push({ shortcut: keys[i], scope: scope, method: method, key: keys[i], mods: mods });
    }
  };

  // Returns true if the key with code 'keyCode' is currently down
  // Converts strings into key codes.
  function isPressed(keyCode) {
      if (typeof(keyCode)=='string') {
        keyCode = code(keyCode);
      }
      return index(_downKeys, keyCode) != -1;
  }

  function getPressedKeyCodes() {
      return _downKeys.slice(0);
  }

  function filter(event){
    var tagName = (event.target || event.srcElement).tagName;
    // ignore keypressed in any elements that support keyboard data input
    return !(tagName == 'INPUT' || tagName == 'SELECT' || tagName == 'TEXTAREA');
  }

  // initialize key.<modifier> to false
  for(k in _MODIFIERS) assignKey[k] = false;

  // set current scope (default 'all')
  function setScope(scope){ _scope = scope || 'all' };
  function getScope(){ return _scope || 'all' };

  // delete all handlers for a given scope
  function deleteScope(scope){
    var key, handlers, i;

    for (key in _handlers) {
      handlers = _handlers[key];
      for (i = 0; i < handlers.length; ) {
        if (handlers[i].scope === scope) handlers.splice(i, 1);
        else i++;
      }
    }
  };

  // cross-browser events
  function addEvent(object, event, method) {
    if (object.addEventListener)
      object.addEventListener(event, method, false);
    else if(object.attachEvent)
      object.attachEvent('on'+event, function(){ method(window.event) });
  };

  // set the handlers globally on document
  addEvent(document, 'keydown', function(event) { dispatch(event, _scope) }); // Passing _scope to a callback to ensure it remains the same by execution. Fixes #48
  addEvent(document, 'keyup', clearModifier);

  // reset modifiers to false whenever the window is (re)focused.
  addEvent(window, 'focus', resetModifiers);

  // store previously defined key
  var previousKey = global.key;

  // restore previously defined key and return reference to our key object
  function noConflict() {
    var k = global.key;
    global.key = previousKey;
    return k;
  }

  // set window.key and window.key.set/get/deleteScope, and the default filter
  global.key = assignKey;
  global.key.setScope = setScope;
  global.key.getScope = getScope;
  global.key.deleteScope = deleteScope;
  global.key.filter = filter;
  global.key.isPressed = isPressed;
  global.key.getPressedKeyCodes = getPressedKeyCodes;
  global.key.noConflict = noConflict;

  if(typeof module !== 'undefined') module.exports = key;

})(this);

define("lib/keymaster/keymaster.js", function(){});

// 1.0.0
var JSHINT;
(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;
    
    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",Function(['require','module','exports','__dirname','__filename','process','global'],"function filter (xs, fn) {\n    var res = [];\n    for (var i = 0; i < xs.length; i++) {\n        if (fn(xs[i], i, xs)) res.push(xs[i]);\n    }\n    return res;\n}\n\n// resolves . and .. elements in a path array with directory names there\n// must be no slashes, empty elements, or device names (c:\\) in the array\n// (so also no leading and trailing slashes - it does not distinguish\n// relative and absolute paths)\nfunction normalizeArray(parts, allowAboveRoot) {\n  // if the path tries to go above the root, `up` ends up > 0\n  var up = 0;\n  for (var i = parts.length; i >= 0; i--) {\n    var last = parts[i];\n    if (last == '.') {\n      parts.splice(i, 1);\n    } else if (last === '..') {\n      parts.splice(i, 1);\n      up++;\n    } else if (up) {\n      parts.splice(i, 1);\n      up--;\n    }\n  }\n\n  // if the path is allowed to go above the root, restore leading ..s\n  if (allowAboveRoot) {\n    for (; up--; up) {\n      parts.unshift('..');\n    }\n  }\n\n  return parts;\n}\n\n// Regex to split a filename into [*, dir, basename, ext]\n// posix version\nvar splitPathRe = /^(.+\\/(?!$)|\\/)?((?:.+?)?(\\.[^.]*)?)$/;\n\n// path.resolve([from ...], to)\n// posix version\nexports.resolve = function() {\nvar resolvedPath = '',\n    resolvedAbsolute = false;\n\nfor (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {\n  var path = (i >= 0)\n      ? arguments[i]\n      : process.cwd();\n\n  // Skip empty and invalid entries\n  if (typeof path !== 'string' || !path) {\n    continue;\n  }\n\n  resolvedPath = path + '/' + resolvedPath;\n  resolvedAbsolute = path.charAt(0) === '/';\n}\n\n// At this point the path should be resolved to a full absolute path, but\n// handle relative paths to be safe (might happen when process.cwd() fails)\n\n// Normalize the path\nresolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {\n    return !!p;\n  }), !resolvedAbsolute).join('/');\n\n  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';\n};\n\n// path.normalize(path)\n// posix version\nexports.normalize = function(path) {\nvar isAbsolute = path.charAt(0) === '/',\n    trailingSlash = path.slice(-1) === '/';\n\n// Normalize the path\npath = normalizeArray(filter(path.split('/'), function(p) {\n    return !!p;\n  }), !isAbsolute).join('/');\n\n  if (!path && !isAbsolute) {\n    path = '.';\n  }\n  if (path && trailingSlash) {\n    path += '/';\n  }\n  \n  return (isAbsolute ? '/' : '') + path;\n};\n\n\n// posix version\nexports.join = function() {\n  var paths = Array.prototype.slice.call(arguments, 0);\n  return exports.normalize(filter(paths, function(p, index) {\n    return p && typeof p === 'string';\n  }).join('/'));\n};\n\n\nexports.dirname = function(path) {\n  var dir = splitPathRe.exec(path)[1] || '';\n  var isWindows = false;\n  if (!dir) {\n    // No dirname\n    return '.';\n  } else if (dir.length === 1 ||\n      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {\n    // It is just a slash or a drive letter with a slash\n    return dir;\n  } else {\n    // It is a full dirname, strip trailing slash\n    return dir.substring(0, dir.length - 1);\n  }\n};\n\n\nexports.basename = function(path, ext) {\n  var f = splitPathRe.exec(path)[2] || '';\n  // TODO: make this comparison case-insensitive on windows?\n  if (ext && f.substr(-1 * ext.length) === ext) {\n    f = f.substr(0, f.length - ext.length);\n  }\n  return f;\n};\n\n\nexports.extname = function(path) {\n  return splitPathRe.exec(path)[3] || '';\n};\n\n//@ sourceURL=path"
));

require.define("__browserify_process",Function(['require','module','exports','__dirname','__filename','process','global'],"var process = module.exports = {};\n\nprocess.nextTick = (function () {\n    var canSetImmediate = typeof window !== 'undefined'\n        && window.setImmediate;\n    var canPost = typeof window !== 'undefined'\n        && window.postMessage && window.addEventListener\n    ;\n\n    if (canSetImmediate) {\n        return window.setImmediate;\n    }\n\n    if (canPost) {\n        var queue = [];\n        window.addEventListener('message', function (ev) {\n            if (ev.source === window && ev.data === 'browserify-tick') {\n                ev.stopPropagation();\n                if (queue.length > 0) {\n                    var fn = queue.shift();\n                    fn();\n                }\n            }\n        }, true);\n\n        return function nextTick(fn) {\n            queue.push(fn);\n            window.postMessage('browserify-tick', '*');\n        };\n    }\n\n    return function nextTick(fn) {\n        setTimeout(fn, 0);\n    };\n})();\n\nprocess.title = 'browser';\nprocess.browser = true;\nprocess.env = {};\nprocess.argv = [];\n\nprocess.binding = function (name) {\n    if (name === 'evals') return (require)('vm')\n    else throw new Error('No such module. (Possibly not yet loaded)')\n};\n\n(function () {\n    var cwd = '/';\n    var path;\n    process.cwd = function () { return cwd };\n    process.chdir = function (dir) {\n        if (!path) path = require('path');\n        cwd = path.resolve(dir, cwd);\n    };\n})();\n\n//@ sourceURL=__browserify_process"
));

require.define("/node_modules/underscore/package.json",Function(['require','module','exports','__dirname','__filename','process','global'],"module.exports = {\"main\":\"underscore.js\"}\n//@ sourceURL=/node_modules/underscore/package.json"
));

require.define("/node_modules/underscore/underscore.js",Function(['require','module','exports','__dirname','__filename','process','global'],"//     Underscore.js 1.4.2\n//     http://underscorejs.org\n//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.\n//     Underscore may be freely distributed under the MIT license.\n\n(function() {\n\n  // Baseline setup\n  // --------------\n\n  // Establish the root object, `window` in the browser, or `global` on the server.\n  var root = this;\n\n  // Save the previous value of the `_` variable.\n  var previousUnderscore = root._;\n\n  // Establish the object that gets returned to break out of a loop iteration.\n  var breaker = {};\n\n  // Save bytes in the minified (but not gzipped) version:\n  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;\n\n  // Create quick reference variables for speed access to core prototypes.\n  var push             = ArrayProto.push,\n      slice            = ArrayProto.slice,\n      concat           = ArrayProto.concat,\n      unshift          = ArrayProto.unshift,\n      toString         = ObjProto.toString,\n      hasOwnProperty   = ObjProto.hasOwnProperty;\n\n  // All **ECMAScript 5** native function implementations that we hope to use\n  // are declared here.\n  var\n    nativeForEach      = ArrayProto.forEach,\n    nativeMap          = ArrayProto.map,\n    nativeReduce       = ArrayProto.reduce,\n    nativeReduceRight  = ArrayProto.reduceRight,\n    nativeFilter       = ArrayProto.filter,\n    nativeEvery        = ArrayProto.every,\n    nativeSome         = ArrayProto.some,\n    nativeIndexOf      = ArrayProto.indexOf,\n    nativeLastIndexOf  = ArrayProto.lastIndexOf,\n    nativeIsArray      = Array.isArray,\n    nativeKeys         = Object.keys,\n    nativeBind         = FuncProto.bind;\n\n  // Create a safe reference to the Underscore object for use below.\n  var _ = function(obj) {\n    if (obj instanceof _) return obj;\n    if (!(this instanceof _)) return new _(obj);\n    this._wrapped = obj;\n  };\n\n  // Export the Underscore object for **Node.js**, with\n  // backwards-compatibility for the old `require()` API. If we're in\n  // the browser, add `_` as a global object via a string identifier,\n  // for Closure Compiler \"advanced\" mode.\n  if (typeof exports !== 'undefined') {\n    if (typeof module !== 'undefined' && module.exports) {\n      exports = module.exports = _;\n    }\n    exports._ = _;\n  } else {\n    root['_'] = _;\n  }\n\n  // Current version.\n  _.VERSION = '1.4.2';\n\n  // Collection Functions\n  // --------------------\n\n  // The cornerstone, an `each` implementation, aka `forEach`.\n  // Handles objects with the built-in `forEach`, arrays, and raw objects.\n  // Delegates to **ECMAScript 5**'s native `forEach` if available.\n  var each = _.each = _.forEach = function(obj, iterator, context) {\n    if (obj == null) return;\n    if (nativeForEach && obj.forEach === nativeForEach) {\n      obj.forEach(iterator, context);\n    } else if (obj.length === +obj.length) {\n      for (var i = 0, l = obj.length; i < l; i++) {\n        if (iterator.call(context, obj[i], i, obj) === breaker) return;\n      }\n    } else {\n      for (var key in obj) {\n        if (_.has(obj, key)) {\n          if (iterator.call(context, obj[key], key, obj) === breaker) return;\n        }\n      }\n    }\n  };\n\n  // Return the results of applying the iterator to each element.\n  // Delegates to **ECMAScript 5**'s native `map` if available.\n  _.map = _.collect = function(obj, iterator, context) {\n    var results = [];\n    if (obj == null) return results;\n    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);\n    each(obj, function(value, index, list) {\n      results[results.length] = iterator.call(context, value, index, list);\n    });\n    return results;\n  };\n\n  // **Reduce** builds up a single result from a list of values, aka `inject`,\n  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.\n  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {\n    var initial = arguments.length > 2;\n    if (obj == null) obj = [];\n    if (nativeReduce && obj.reduce === nativeReduce) {\n      if (context) iterator = _.bind(iterator, context);\n      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);\n    }\n    each(obj, function(value, index, list) {\n      if (!initial) {\n        memo = value;\n        initial = true;\n      } else {\n        memo = iterator.call(context, memo, value, index, list);\n      }\n    });\n    if (!initial) throw new TypeError('Reduce of empty array with no initial value');\n    return memo;\n  };\n\n  // The right-associative version of reduce, also known as `foldr`.\n  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.\n  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {\n    var initial = arguments.length > 2;\n    if (obj == null) obj = [];\n    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {\n      if (context) iterator = _.bind(iterator, context);\n      return arguments.length > 2 ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);\n    }\n    var length = obj.length;\n    if (length !== +length) {\n      var keys = _.keys(obj);\n      length = keys.length;\n    }\n    each(obj, function(value, index, list) {\n      index = keys ? keys[--length] : --length;\n      if (!initial) {\n        memo = obj[index];\n        initial = true;\n      } else {\n        memo = iterator.call(context, memo, obj[index], index, list);\n      }\n    });\n    if (!initial) throw new TypeError('Reduce of empty array with no initial value');\n    return memo;\n  };\n\n  // Return the first value which passes a truth test. Aliased as `detect`.\n  _.find = _.detect = function(obj, iterator, context) {\n    var result;\n    any(obj, function(value, index, list) {\n      if (iterator.call(context, value, index, list)) {\n        result = value;\n        return true;\n      }\n    });\n    return result;\n  };\n\n  // Return all the elements that pass a truth test.\n  // Delegates to **ECMAScript 5**'s native `filter` if available.\n  // Aliased as `select`.\n  _.filter = _.select = function(obj, iterator, context) {\n    var results = [];\n    if (obj == null) return results;\n    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);\n    each(obj, function(value, index, list) {\n      if (iterator.call(context, value, index, list)) results[results.length] = value;\n    });\n    return results;\n  };\n\n  // Return all the elements for which a truth test fails.\n  _.reject = function(obj, iterator, context) {\n    var results = [];\n    if (obj == null) return results;\n    each(obj, function(value, index, list) {\n      if (!iterator.call(context, value, index, list)) results[results.length] = value;\n    });\n    return results;\n  };\n\n  // Determine whether all of the elements match a truth test.\n  // Delegates to **ECMAScript 5**'s native `every` if available.\n  // Aliased as `all`.\n  _.every = _.all = function(obj, iterator, context) {\n    iterator || (iterator = _.identity);\n    var result = true;\n    if (obj == null) return result;\n    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);\n    each(obj, function(value, index, list) {\n      if (!(result = result && iterator.call(context, value, index, list))) return breaker;\n    });\n    return !!result;\n  };\n\n  // Determine if at least one element in the object matches a truth test.\n  // Delegates to **ECMAScript 5**'s native `some` if available.\n  // Aliased as `any`.\n  var any = _.some = _.any = function(obj, iterator, context) {\n    iterator || (iterator = _.identity);\n    var result = false;\n    if (obj == null) return result;\n    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);\n    each(obj, function(value, index, list) {\n      if (result || (result = iterator.call(context, value, index, list))) return breaker;\n    });\n    return !!result;\n  };\n\n  // Determine if the array or object contains a given value (using `===`).\n  // Aliased as `include`.\n  _.contains = _.include = function(obj, target) {\n    var found = false;\n    if (obj == null) return found;\n    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;\n    found = any(obj, function(value) {\n      return value === target;\n    });\n    return found;\n  };\n\n  // Invoke a method (with arguments) on every item in a collection.\n  _.invoke = function(obj, method) {\n    var args = slice.call(arguments, 2);\n    return _.map(obj, function(value) {\n      return (_.isFunction(method) ? method : value[method]).apply(value, args);\n    });\n  };\n\n  // Convenience version of a common use case of `map`: fetching a property.\n  _.pluck = function(obj, key) {\n    return _.map(obj, function(value){ return value[key]; });\n  };\n\n  // Convenience version of a common use case of `filter`: selecting only objects\n  // with specific `key:value` pairs.\n  _.where = function(obj, attrs) {\n    if (_.isEmpty(attrs)) return [];\n    return _.filter(obj, function(value) {\n      for (var key in attrs) {\n        if (attrs[key] !== value[key]) return false;\n      }\n      return true;\n    });\n  };\n\n  // Return the maximum element or (element-based computation).\n  // Can't optimize arrays of integers longer than 65,535 elements.\n  // See: https://bugs.webkit.org/show_bug.cgi?id=80797\n  _.max = function(obj, iterator, context) {\n    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {\n      return Math.max.apply(Math, obj);\n    }\n    if (!iterator && _.isEmpty(obj)) return -Infinity;\n    var result = {computed : -Infinity};\n    each(obj, function(value, index, list) {\n      var computed = iterator ? iterator.call(context, value, index, list) : value;\n      computed >= result.computed && (result = {value : value, computed : computed});\n    });\n    return result.value;\n  };\n\n  // Return the minimum element (or element-based computation).\n  _.min = function(obj, iterator, context) {\n    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {\n      return Math.min.apply(Math, obj);\n    }\n    if (!iterator && _.isEmpty(obj)) return Infinity;\n    var result = {computed : Infinity};\n    each(obj, function(value, index, list) {\n      var computed = iterator ? iterator.call(context, value, index, list) : value;\n      computed < result.computed && (result = {value : value, computed : computed});\n    });\n    return result.value;\n  };\n\n  // Shuffle an array.\n  _.shuffle = function(obj) {\n    var rand;\n    var index = 0;\n    var shuffled = [];\n    each(obj, function(value) {\n      rand = _.random(index++);\n      shuffled[index - 1] = shuffled[rand];\n      shuffled[rand] = value;\n    });\n    return shuffled;\n  };\n\n  // An internal function to generate lookup iterators.\n  var lookupIterator = function(value) {\n    return _.isFunction(value) ? value : function(obj){ return obj[value]; };\n  };\n\n  // Sort the object's values by a criterion produced by an iterator.\n  _.sortBy = function(obj, value, context) {\n    var iterator = lookupIterator(value);\n    return _.pluck(_.map(obj, function(value, index, list) {\n      return {\n        value : value,\n        index : index,\n        criteria : iterator.call(context, value, index, list)\n      };\n    }).sort(function(left, right) {\n      var a = left.criteria;\n      var b = right.criteria;\n      if (a !== b) {\n        if (a > b || a === void 0) return 1;\n        if (a < b || b === void 0) return -1;\n      }\n      return left.index < right.index ? -1 : 1;\n    }), 'value');\n  };\n\n  // An internal function used for aggregate \"group by\" operations.\n  var group = function(obj, value, context, behavior) {\n    var result = {};\n    var iterator = lookupIterator(value);\n    each(obj, function(value, index) {\n      var key = iterator.call(context, value, index, obj);\n      behavior(result, key, value);\n    });\n    return result;\n  };\n\n  // Groups the object's values by a criterion. Pass either a string attribute\n  // to group by, or a function that returns the criterion.\n  _.groupBy = function(obj, value, context) {\n    return group(obj, value, context, function(result, key, value) {\n      (_.has(result, key) ? result[key] : (result[key] = [])).push(value);\n    });\n  };\n\n  // Counts instances of an object that group by a certain criterion. Pass\n  // either a string attribute to count by, or a function that returns the\n  // criterion.\n  _.countBy = function(obj, value, context) {\n    return group(obj, value, context, function(result, key, value) {\n      if (!_.has(result, key)) result[key] = 0;\n      result[key]++;\n    });\n  };\n\n  // Use a comparator function to figure out the smallest index at which\n  // an object should be inserted so as to maintain order. Uses binary search.\n  _.sortedIndex = function(array, obj, iterator, context) {\n    iterator = iterator == null ? _.identity : lookupIterator(iterator);\n    var value = iterator.call(context, obj);\n    var low = 0, high = array.length;\n    while (low < high) {\n      var mid = (low + high) >>> 1;\n      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;\n    }\n    return low;\n  };\n\n  // Safely convert anything iterable into a real, live array.\n  _.toArray = function(obj) {\n    if (!obj) return [];\n    if (obj.length === +obj.length) return slice.call(obj);\n    return _.values(obj);\n  };\n\n  // Return the number of elements in an object.\n  _.size = function(obj) {\n    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;\n  };\n\n  // Array Functions\n  // ---------------\n\n  // Get the first element of an array. Passing **n** will return the first N\n  // values in the array. Aliased as `head` and `take`. The **guard** check\n  // allows it to work with `_.map`.\n  _.first = _.head = _.take = function(array, n, guard) {\n    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];\n  };\n\n  // Returns everything but the last entry of the array. Especially useful on\n  // the arguments object. Passing **n** will return all the values in\n  // the array, excluding the last N. The **guard** check allows it to work with\n  // `_.map`.\n  _.initial = function(array, n, guard) {\n    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));\n  };\n\n  // Get the last element of an array. Passing **n** will return the last N\n  // values in the array. The **guard** check allows it to work with `_.map`.\n  _.last = function(array, n, guard) {\n    if ((n != null) && !guard) {\n      return slice.call(array, Math.max(array.length - n, 0));\n    } else {\n      return array[array.length - 1];\n    }\n  };\n\n  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.\n  // Especially useful on the arguments object. Passing an **n** will return\n  // the rest N values in the array. The **guard**\n  // check allows it to work with `_.map`.\n  _.rest = _.tail = _.drop = function(array, n, guard) {\n    return slice.call(array, (n == null) || guard ? 1 : n);\n  };\n\n  // Trim out all falsy values from an array.\n  _.compact = function(array) {\n    return _.filter(array, function(value){ return !!value; });\n  };\n\n  // Internal implementation of a recursive `flatten` function.\n  var flatten = function(input, shallow, output) {\n    each(input, function(value) {\n      if (_.isArray(value)) {\n        shallow ? push.apply(output, value) : flatten(value, shallow, output);\n      } else {\n        output.push(value);\n      }\n    });\n    return output;\n  };\n\n  // Return a completely flattened version of an array.\n  _.flatten = function(array, shallow) {\n    return flatten(array, shallow, []);\n  };\n\n  // Return a version of the array that does not contain the specified value(s).\n  _.without = function(array) {\n    return _.difference(array, slice.call(arguments, 1));\n  };\n\n  // Produce a duplicate-free version of the array. If the array has already\n  // been sorted, you have the option of using a faster algorithm.\n  // Aliased as `unique`.\n  _.uniq = _.unique = function(array, isSorted, iterator, context) {\n    var initial = iterator ? _.map(array, iterator, context) : array;\n    var results = [];\n    var seen = [];\n    each(initial, function(value, index) {\n      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {\n        seen.push(value);\n        results.push(array[index]);\n      }\n    });\n    return results;\n  };\n\n  // Produce an array that contains the union: each distinct element from all of\n  // the passed-in arrays.\n  _.union = function() {\n    return _.uniq(concat.apply(ArrayProto, arguments));\n  };\n\n  // Produce an array that contains every item shared between all the\n  // passed-in arrays.\n  _.intersection = function(array) {\n    var rest = slice.call(arguments, 1);\n    return _.filter(_.uniq(array), function(item) {\n      return _.every(rest, function(other) {\n        return _.indexOf(other, item) >= 0;\n      });\n    });\n  };\n\n  // Take the difference between one array and a number of other arrays.\n  // Only the elements present in just the first array will remain.\n  _.difference = function(array) {\n    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));\n    return _.filter(array, function(value){ return !_.contains(rest, value); });\n  };\n\n  // Zip together multiple lists into a single array -- elements that share\n  // an index go together.\n  _.zip = function() {\n    var args = slice.call(arguments);\n    var length = _.max(_.pluck(args, 'length'));\n    var results = new Array(length);\n    for (var i = 0; i < length; i++) {\n      results[i] = _.pluck(args, \"\" + i);\n    }\n    return results;\n  };\n\n  // Converts lists into objects. Pass either a single array of `[key, value]`\n  // pairs, or two parallel arrays of the same length -- one of keys, and one of\n  // the corresponding values.\n  _.object = function(list, values) {\n    var result = {};\n    for (var i = 0, l = list.length; i < l; i++) {\n      if (values) {\n        result[list[i]] = values[i];\n      } else {\n        result[list[i][0]] = list[i][1];\n      }\n    }\n    return result;\n  };\n\n  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),\n  // we need this function. Return the position of the first occurrence of an\n  // item in an array, or -1 if the item is not included in the array.\n  // Delegates to **ECMAScript 5**'s native `indexOf` if available.\n  // If the array is large and already in sort order, pass `true`\n  // for **isSorted** to use binary search.\n  _.indexOf = function(array, item, isSorted) {\n    if (array == null) return -1;\n    var i = 0, l = array.length;\n    if (isSorted) {\n      if (typeof isSorted == 'number') {\n        i = (isSorted < 0 ? Math.max(0, l + isSorted) : isSorted);\n      } else {\n        i = _.sortedIndex(array, item);\n        return array[i] === item ? i : -1;\n      }\n    }\n    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);\n    for (; i < l; i++) if (array[i] === item) return i;\n    return -1;\n  };\n\n  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.\n  _.lastIndexOf = function(array, item, from) {\n    if (array == null) return -1;\n    var hasIndex = from != null;\n    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {\n      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);\n    }\n    var i = (hasIndex ? from : array.length);\n    while (i--) if (array[i] === item) return i;\n    return -1;\n  };\n\n  // Generate an integer Array containing an arithmetic progression. A port of\n  // the native Python `range()` function. See\n  // [the Python documentation](http://docs.python.org/library/functions.html#range).\n  _.range = function(start, stop, step) {\n    if (arguments.length <= 1) {\n      stop = start || 0;\n      start = 0;\n    }\n    step = arguments[2] || 1;\n\n    var len = Math.max(Math.ceil((stop - start) / step), 0);\n    var idx = 0;\n    var range = new Array(len);\n\n    while(idx < len) {\n      range[idx++] = start;\n      start += step;\n    }\n\n    return range;\n  };\n\n  // Function (ahem) Functions\n  // ------------------\n\n  // Reusable constructor function for prototype setting.\n  var ctor = function(){};\n\n  // Create a function bound to a given object (assigning `this`, and arguments,\n  // optionally). Binding with arguments is also known as `curry`.\n  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.\n  // We check for `func.bind` first, to fail fast when `func` is undefined.\n  _.bind = function bind(func, context) {\n    var bound, args;\n    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));\n    if (!_.isFunction(func)) throw new TypeError;\n    args = slice.call(arguments, 2);\n    return bound = function() {\n      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));\n      ctor.prototype = func.prototype;\n      var self = new ctor;\n      var result = func.apply(self, args.concat(slice.call(arguments)));\n      if (Object(result) === result) return result;\n      return self;\n    };\n  };\n\n  // Bind all of an object's methods to that object. Useful for ensuring that\n  // all callbacks defined on an object belong to it.\n  _.bindAll = function(obj) {\n    var funcs = slice.call(arguments, 1);\n    if (funcs.length == 0) funcs = _.functions(obj);\n    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });\n    return obj;\n  };\n\n  // Memoize an expensive function by storing its results.\n  _.memoize = function(func, hasher) {\n    var memo = {};\n    hasher || (hasher = _.identity);\n    return function() {\n      var key = hasher.apply(this, arguments);\n      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));\n    };\n  };\n\n  // Delays a function for the given number of milliseconds, and then calls\n  // it with the arguments supplied.\n  _.delay = function(func, wait) {\n    var args = slice.call(arguments, 2);\n    return setTimeout(function(){ return func.apply(null, args); }, wait);\n  };\n\n  // Defers a function, scheduling it to run after the current call stack has\n  // cleared.\n  _.defer = function(func) {\n    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));\n  };\n\n  // Returns a function, that, when invoked, will only be triggered at most once\n  // during a given window of time.\n  _.throttle = function(func, wait) {\n    var context, args, timeout, throttling, more, result;\n    var whenDone = _.debounce(function(){ more = throttling = false; }, wait);\n    return function() {\n      context = this; args = arguments;\n      var later = function() {\n        timeout = null;\n        if (more) {\n          result = func.apply(context, args);\n        }\n        whenDone();\n      };\n      if (!timeout) timeout = setTimeout(later, wait);\n      if (throttling) {\n        more = true;\n      } else {\n        throttling = true;\n        result = func.apply(context, args);\n      }\n      whenDone();\n      return result;\n    };\n  };\n\n  // Returns a function, that, as long as it continues to be invoked, will not\n  // be triggered. The function will be called after it stops being called for\n  // N milliseconds. If `immediate` is passed, trigger the function on the\n  // leading edge, instead of the trailing.\n  _.debounce = function(func, wait, immediate) {\n    var timeout, result;\n    return function() {\n      var context = this, args = arguments;\n      var later = function() {\n        timeout = null;\n        if (!immediate) result = func.apply(context, args);\n      };\n      var callNow = immediate && !timeout;\n      clearTimeout(timeout);\n      timeout = setTimeout(later, wait);\n      if (callNow) result = func.apply(context, args);\n      return result;\n    };\n  };\n\n  // Returns a function that will be executed at most one time, no matter how\n  // often you call it. Useful for lazy initialization.\n  _.once = function(func) {\n    var ran = false, memo;\n    return function() {\n      if (ran) return memo;\n      ran = true;\n      memo = func.apply(this, arguments);\n      func = null;\n      return memo;\n    };\n  };\n\n  // Returns the first function passed as an argument to the second,\n  // allowing you to adjust arguments, run code before and after, and\n  // conditionally execute the original function.\n  _.wrap = function(func, wrapper) {\n    return function() {\n      var args = [func];\n      push.apply(args, arguments);\n      return wrapper.apply(this, args);\n    };\n  };\n\n  // Returns a function that is the composition of a list of functions, each\n  // consuming the return value of the function that follows.\n  _.compose = function() {\n    var funcs = arguments;\n    return function() {\n      var args = arguments;\n      for (var i = funcs.length - 1; i >= 0; i--) {\n        args = [funcs[i].apply(this, args)];\n      }\n      return args[0];\n    };\n  };\n\n  // Returns a function that will only be executed after being called N times.\n  _.after = function(times, func) {\n    if (times <= 0) return func();\n    return function() {\n      if (--times < 1) {\n        return func.apply(this, arguments);\n      }\n    };\n  };\n\n  // Object Functions\n  // ----------------\n\n  // Retrieve the names of an object's properties.\n  // Delegates to **ECMAScript 5**'s native `Object.keys`\n  _.keys = nativeKeys || function(obj) {\n    if (obj !== Object(obj)) throw new TypeError('Invalid object');\n    var keys = [];\n    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;\n    return keys;\n  };\n\n  // Retrieve the values of an object's properties.\n  _.values = function(obj) {\n    var values = [];\n    for (var key in obj) if (_.has(obj, key)) values.push(obj[key]);\n    return values;\n  };\n\n  // Convert an object into a list of `[key, value]` pairs.\n  _.pairs = function(obj) {\n    var pairs = [];\n    for (var key in obj) if (_.has(obj, key)) pairs.push([key, obj[key]]);\n    return pairs;\n  };\n\n  // Invert the keys and values of an object. The values must be serializable.\n  _.invert = function(obj) {\n    var result = {};\n    for (var key in obj) if (_.has(obj, key)) result[obj[key]] = key;\n    return result;\n  };\n\n  // Return a sorted list of the function names available on the object.\n  // Aliased as `methods`\n  _.functions = _.methods = function(obj) {\n    var names = [];\n    for (var key in obj) {\n      if (_.isFunction(obj[key])) names.push(key);\n    }\n    return names.sort();\n  };\n\n  // Extend a given object with all the properties in passed-in object(s).\n  _.extend = function(obj) {\n    each(slice.call(arguments, 1), function(source) {\n      for (var prop in source) {\n        obj[prop] = source[prop];\n      }\n    });\n    return obj;\n  };\n\n  // Return a copy of the object only containing the whitelisted properties.\n  _.pick = function(obj) {\n    var copy = {};\n    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));\n    each(keys, function(key) {\n      if (key in obj) copy[key] = obj[key];\n    });\n    return copy;\n  };\n\n   // Return a copy of the object without the blacklisted properties.\n  _.omit = function(obj) {\n    var copy = {};\n    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));\n    for (var key in obj) {\n      if (!_.contains(keys, key)) copy[key] = obj[key];\n    }\n    return copy;\n  };\n\n  // Fill in a given object with default properties.\n  _.defaults = function(obj) {\n    each(slice.call(arguments, 1), function(source) {\n      for (var prop in source) {\n        if (obj[prop] == null) obj[prop] = source[prop];\n      }\n    });\n    return obj;\n  };\n\n  // Create a (shallow-cloned) duplicate of an object.\n  _.clone = function(obj) {\n    if (!_.isObject(obj)) return obj;\n    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);\n  };\n\n  // Invokes interceptor with the obj, and then returns obj.\n  // The primary purpose of this method is to \"tap into\" a method chain, in\n  // order to perform operations on intermediate results within the chain.\n  _.tap = function(obj, interceptor) {\n    interceptor(obj);\n    return obj;\n  };\n\n  // Internal recursive comparison function for `isEqual`.\n  var eq = function(a, b, aStack, bStack) {\n    // Identical objects are equal. `0 === -0`, but they aren't identical.\n    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.\n    if (a === b) return a !== 0 || 1 / a == 1 / b;\n    // A strict comparison is necessary because `null == undefined`.\n    if (a == null || b == null) return a === b;\n    // Unwrap any wrapped objects.\n    if (a instanceof _) a = a._wrapped;\n    if (b instanceof _) b = b._wrapped;\n    // Compare `[[Class]]` names.\n    var className = toString.call(a);\n    if (className != toString.call(b)) return false;\n    switch (className) {\n      // Strings, numbers, dates, and booleans are compared by value.\n      case '[object String]':\n        // Primitives and their corresponding object wrappers are equivalent; thus, `\"5\"` is\n        // equivalent to `new String(\"5\")`.\n        return a == String(b);\n      case '[object Number]':\n        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for\n        // other numeric values.\n        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);\n      case '[object Date]':\n      case '[object Boolean]':\n        // Coerce dates and booleans to numeric primitive values. Dates are compared by their\n        // millisecond representations. Note that invalid dates with millisecond representations\n        // of `NaN` are not equivalent.\n        return +a == +b;\n      // RegExps are compared by their source patterns and flags.\n      case '[object RegExp]':\n        return a.source == b.source &&\n               a.global == b.global &&\n               a.multiline == b.multiline &&\n               a.ignoreCase == b.ignoreCase;\n    }\n    if (typeof a != 'object' || typeof b != 'object') return false;\n    // Assume equality for cyclic structures. The algorithm for detecting cyclic\n    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.\n    var length = aStack.length;\n    while (length--) {\n      // Linear search. Performance is inversely proportional to the number of\n      // unique nested structures.\n      if (aStack[length] == a) return bStack[length] == b;\n    }\n    // Add the first object to the stack of traversed objects.\n    aStack.push(a);\n    bStack.push(b);\n    var size = 0, result = true;\n    // Recursively compare objects and arrays.\n    if (className == '[object Array]') {\n      // Compare array lengths to determine if a deep comparison is necessary.\n      size = a.length;\n      result = size == b.length;\n      if (result) {\n        // Deep compare the contents, ignoring non-numeric properties.\n        while (size--) {\n          if (!(result = eq(a[size], b[size], aStack, bStack))) break;\n        }\n      }\n    } else {\n      // Objects with different constructors are not equivalent, but `Object`s\n      // from different frames are.\n      var aCtor = a.constructor, bCtor = b.constructor;\n      if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&\n                               _.isFunction(bCtor) && (bCtor instanceof bCtor))) {\n        return false;\n      }\n      // Deep compare objects.\n      for (var key in a) {\n        if (_.has(a, key)) {\n          // Count the expected number of properties.\n          size++;\n          // Deep compare each member.\n          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;\n        }\n      }\n      // Ensure that both objects contain the same number of properties.\n      if (result) {\n        for (key in b) {\n          if (_.has(b, key) && !(size--)) break;\n        }\n        result = !size;\n      }\n    }\n    // Remove the first object from the stack of traversed objects.\n    aStack.pop();\n    bStack.pop();\n    return result;\n  };\n\n  // Perform a deep comparison to check if two objects are equal.\n  _.isEqual = function(a, b) {\n    return eq(a, b, [], []);\n  };\n\n  // Is a given array, string, or object empty?\n  // An \"empty\" object has no enumerable own-properties.\n  _.isEmpty = function(obj) {\n    if (obj == null) return true;\n    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;\n    for (var key in obj) if (_.has(obj, key)) return false;\n    return true;\n  };\n\n  // Is a given value a DOM element?\n  _.isElement = function(obj) {\n    return !!(obj && obj.nodeType === 1);\n  };\n\n  // Is a given value an array?\n  // Delegates to ECMA5's native Array.isArray\n  _.isArray = nativeIsArray || function(obj) {\n    return toString.call(obj) == '[object Array]';\n  };\n\n  // Is a given variable an object?\n  _.isObject = function(obj) {\n    return obj === Object(obj);\n  };\n\n  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.\n  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {\n    _['is' + name] = function(obj) {\n      return toString.call(obj) == '[object ' + name + ']';\n    };\n  });\n\n  // Define a fallback version of the method in browsers (ahem, IE), where\n  // there isn't any inspectable \"Arguments\" type.\n  if (!_.isArguments(arguments)) {\n    _.isArguments = function(obj) {\n      return !!(obj && _.has(obj, 'callee'));\n    };\n  }\n\n  // Optimize `isFunction` if appropriate.\n  if (typeof (/./) !== 'function') {\n    _.isFunction = function(obj) {\n      return typeof obj === 'function';\n    };\n  }\n\n  // Is a given object a finite number?\n  _.isFinite = function(obj) {\n    return _.isNumber(obj) && isFinite(obj);\n  };\n\n  // Is the given value `NaN`? (NaN is the only number which does not equal itself).\n  _.isNaN = function(obj) {\n    return _.isNumber(obj) && obj != +obj;\n  };\n\n  // Is a given value a boolean?\n  _.isBoolean = function(obj) {\n    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';\n  };\n\n  // Is a given value equal to null?\n  _.isNull = function(obj) {\n    return obj === null;\n  };\n\n  // Is a given variable undefined?\n  _.isUndefined = function(obj) {\n    return obj === void 0;\n  };\n\n  // Shortcut function for checking if an object has a given property directly\n  // on itself (in other words, not on a prototype).\n  _.has = function(obj, key) {\n    return hasOwnProperty.call(obj, key);\n  };\n\n  // Utility Functions\n  // -----------------\n\n  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its\n  // previous owner. Returns a reference to the Underscore object.\n  _.noConflict = function() {\n    root._ = previousUnderscore;\n    return this;\n  };\n\n  // Keep the identity function around for default iterators.\n  _.identity = function(value) {\n    return value;\n  };\n\n  // Run a function **n** times.\n  _.times = function(n, iterator, context) {\n    for (var i = 0; i < n; i++) iterator.call(context, i);\n  };\n\n  // Return a random integer between min and max (inclusive).\n  _.random = function(min, max) {\n    if (max == null) {\n      max = min;\n      min = 0;\n    }\n    return min + (0 | Math.random() * (max - min + 1));\n  };\n\n  // List of HTML entities for escaping.\n  var entityMap = {\n    escape: {\n      '&': '&amp;',\n      '<': '&lt;',\n      '>': '&gt;',\n      '\"': '&quot;',\n      \"'\": '&#x27;',\n      '/': '&#x2F;'\n    }\n  };\n  entityMap.unescape = _.invert(entityMap.escape);\n\n  // Regexes containing the keys and values listed immediately above.\n  var entityRegexes = {\n    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),\n    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')\n  };\n\n  // Functions for escaping and unescaping strings to/from HTML interpolation.\n  _.each(['escape', 'unescape'], function(method) {\n    _[method] = function(string) {\n      if (string == null) return '';\n      return ('' + string).replace(entityRegexes[method], function(match) {\n        return entityMap[method][match];\n      });\n    };\n  });\n\n  // If the value of the named property is a function then invoke it;\n  // otherwise, return it.\n  _.result = function(object, property) {\n    if (object == null) return null;\n    var value = object[property];\n    return _.isFunction(value) ? value.call(object) : value;\n  };\n\n  // Add your own custom functions to the Underscore object.\n  _.mixin = function(obj) {\n    each(_.functions(obj), function(name){\n      var func = _[name] = obj[name];\n      _.prototype[name] = function() {\n        var args = [this._wrapped];\n        push.apply(args, arguments);\n        return result.call(this, func.apply(_, args));\n      };\n    });\n  };\n\n  // Generate a unique integer id (unique within the entire client session).\n  // Useful for temporary DOM ids.\n  var idCounter = 0;\n  _.uniqueId = function(prefix) {\n    var id = idCounter++;\n    return prefix ? prefix + id : id;\n  };\n\n  // By default, Underscore uses ERB-style template delimiters, change the\n  // following template settings to use alternative delimiters.\n  _.templateSettings = {\n    evaluate    : /<%([\\s\\S]+?)%>/g,\n    interpolate : /<%=([\\s\\S]+?)%>/g,\n    escape      : /<%-([\\s\\S]+?)%>/g\n  };\n\n  // When customizing `templateSettings`, if you don't want to define an\n  // interpolation, evaluation or escaping regex, we need one that is\n  // guaranteed not to match.\n  var noMatch = /(.)^/;\n\n  // Certain characters need to be escaped so that they can be put into a\n  // string literal.\n  var escapes = {\n    \"'\":      \"'\",\n    '\\\\':     '\\\\',\n    '\\r':     'r',\n    '\\n':     'n',\n    '\\t':     't',\n    '\\u2028': 'u2028',\n    '\\u2029': 'u2029'\n  };\n\n  var escaper = /\\\\|'|\\r|\\n|\\t|\\u2028|\\u2029/g;\n\n  // JavaScript micro-templating, similar to John Resig's implementation.\n  // Underscore templating handles arbitrary delimiters, preserves whitespace,\n  // and correctly escapes quotes within interpolated code.\n  _.template = function(text, data, settings) {\n    settings = _.defaults({}, settings, _.templateSettings);\n\n    // Combine delimiters into one regular expression via alternation.\n    var matcher = new RegExp([\n      (settings.escape || noMatch).source,\n      (settings.interpolate || noMatch).source,\n      (settings.evaluate || noMatch).source\n    ].join('|') + '|$', 'g');\n\n    // Compile the template source, escaping string literals appropriately.\n    var index = 0;\n    var source = \"__p+='\";\n    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {\n      source += text.slice(index, offset)\n        .replace(escaper, function(match) { return '\\\\' + escapes[match]; });\n      source +=\n        escape ? \"'+\\n((__t=(\" + escape + \"))==null?'':_.escape(__t))+\\n'\" :\n        interpolate ? \"'+\\n((__t=(\" + interpolate + \"))==null?'':__t)+\\n'\" :\n        evaluate ? \"';\\n\" + evaluate + \"\\n__p+='\" : '';\n      index = offset + match.length;\n    });\n    source += \"';\\n\";\n\n    // If a variable is not specified, place data values in local scope.\n    if (!settings.variable) source = 'with(obj||{}){\\n' + source + '}\\n';\n\n    source = \"var __t,__p='',__j=Array.prototype.join,\" +\n      \"print=function(){__p+=__j.call(arguments,'');};\\n\" +\n      source + \"return __p;\\n\";\n\n    try {\n      var render = new Function(settings.variable || 'obj', '_', source);\n    } catch (e) {\n      e.source = source;\n      throw e;\n    }\n\n    if (data) return render(data, _);\n    var template = function(data) {\n      return render.call(this, data, _);\n    };\n\n    // Provide the compiled function source as a convenience for precompilation.\n    template.source = 'function(' + (settings.variable || 'obj') + '){\\n' + source + '}';\n\n    return template;\n  };\n\n  // Add a \"chain\" function, which will delegate to the wrapper.\n  _.chain = function(obj) {\n    return _(obj).chain();\n  };\n\n  // OOP\n  // ---------------\n  // If Underscore is called as a function, it returns a wrapped object that\n  // can be used OO-style. This wrapper holds altered versions of all the\n  // underscore functions. Wrapped objects may be chained.\n\n  // Helper function to continue chaining intermediate results.\n  var result = function(obj) {\n    return this._chain ? _(obj).chain() : obj;\n  };\n\n  // Add all of the Underscore functions to the wrapper object.\n  _.mixin(_);\n\n  // Add all mutator Array functions to the wrapper.\n  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {\n    var method = ArrayProto[name];\n    _.prototype[name] = function() {\n      var obj = this._wrapped;\n      method.apply(obj, arguments);\n      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];\n      return result.call(this, obj);\n    };\n  });\n\n  // Add all accessor Array functions to the wrapper.\n  each(['concat', 'join', 'slice'], function(name) {\n    var method = ArrayProto[name];\n    _.prototype[name] = function() {\n      return result.call(this, method.apply(this._wrapped, arguments));\n    };\n  });\n\n  _.extend(_.prototype, {\n\n    // Start chaining a wrapped Underscore object.\n    chain: function() {\n      this._chain = true;\n      return this;\n    },\n\n    // Extracts the result from a wrapped and chained object.\n    value: function() {\n      return this._wrapped;\n    }\n\n  });\n\n}).call(this);\n\n//@ sourceURL=/node_modules/underscore/underscore.js"
));

require.define("events",Function(['require','module','exports','__dirname','__filename','process','global'],"if (!process.EventEmitter) process.EventEmitter = function () {};\n\nvar EventEmitter = exports.EventEmitter = process.EventEmitter;\nvar isArray = typeof Array.isArray === 'function'\n    ? Array.isArray\n    : function (xs) {\n        return Object.prototype.toString.call(xs) === '[object Array]'\n    }\n;\n\n// By default EventEmitters will print a warning if more than\n// 10 listeners are added to it. This is a useful default which\n// helps finding memory leaks.\n//\n// Obviously not all Emitters should be limited to 10. This function allows\n// that to be increased. Set to zero for unlimited.\nvar defaultMaxListeners = 10;\nEventEmitter.prototype.setMaxListeners = function(n) {\n  if (!this._events) this._events = {};\n  this._events.maxListeners = n;\n};\n\n\nEventEmitter.prototype.emit = function(type) {\n  // If there is no 'error' event listener then throw.\n  if (type === 'error') {\n    if (!this._events || !this._events.error ||\n        (isArray(this._events.error) && !this._events.error.length))\n    {\n      if (arguments[1] instanceof Error) {\n        throw arguments[1]; // Unhandled 'error' event\n      } else {\n        throw new Error(\"Uncaught, unspecified 'error' event.\");\n      }\n      return false;\n    }\n  }\n\n  if (!this._events) return false;\n  var handler = this._events[type];\n  if (!handler) return false;\n\n  if (typeof handler == 'function') {\n    switch (arguments.length) {\n      // fast cases\n      case 1:\n        handler.call(this);\n        break;\n      case 2:\n        handler.call(this, arguments[1]);\n        break;\n      case 3:\n        handler.call(this, arguments[1], arguments[2]);\n        break;\n      // slower\n      default:\n        var args = Array.prototype.slice.call(arguments, 1);\n        handler.apply(this, args);\n    }\n    return true;\n\n  } else if (isArray(handler)) {\n    var args = Array.prototype.slice.call(arguments, 1);\n\n    var listeners = handler.slice();\n    for (var i = 0, l = listeners.length; i < l; i++) {\n      listeners[i].apply(this, args);\n    }\n    return true;\n\n  } else {\n    return false;\n  }\n};\n\n// EventEmitter is defined in src/node_events.cc\n// EventEmitter.prototype.emit() is also defined there.\nEventEmitter.prototype.addListener = function(type, listener) {\n  if ('function' !== typeof listener) {\n    throw new Error('addListener only takes instances of Function');\n  }\n\n  if (!this._events) this._events = {};\n\n  // To avoid recursion in the case that type == \"newListeners\"! Before\n  // adding it to the listeners, first emit \"newListeners\".\n  this.emit('newListener', type, listener);\n\n  if (!this._events[type]) {\n    // Optimize the case of one listener. Don't need the extra array object.\n    this._events[type] = listener;\n  } else if (isArray(this._events[type])) {\n\n    // Check for listener leak\n    if (!this._events[type].warned) {\n      var m;\n      if (this._events.maxListeners !== undefined) {\n        m = this._events.maxListeners;\n      } else {\n        m = defaultMaxListeners;\n      }\n\n      if (m && m > 0 && this._events[type].length > m) {\n        this._events[type].warned = true;\n        console.error('(node) warning: possible EventEmitter memory ' +\n                      'leak detected. %d listeners added. ' +\n                      'Use emitter.setMaxListeners() to increase limit.',\n                      this._events[type].length);\n        console.trace();\n      }\n    }\n\n    // If we've already got an array, just append.\n    this._events[type].push(listener);\n  } else {\n    // Adding the second element, need to change to array.\n    this._events[type] = [this._events[type], listener];\n  }\n\n  return this;\n};\n\nEventEmitter.prototype.on = EventEmitter.prototype.addListener;\n\nEventEmitter.prototype.once = function(type, listener) {\n  var self = this;\n  self.on(type, function g() {\n    self.removeListener(type, g);\n    listener.apply(this, arguments);\n  });\n\n  return this;\n};\n\nEventEmitter.prototype.removeListener = function(type, listener) {\n  if ('function' !== typeof listener) {\n    throw new Error('removeListener only takes instances of Function');\n  }\n\n  // does not use listeners(), so no side effect of creating _events[type]\n  if (!this._events || !this._events[type]) return this;\n\n  var list = this._events[type];\n\n  if (isArray(list)) {\n    var i = list.indexOf(listener);\n    if (i < 0) return this;\n    list.splice(i, 1);\n    if (list.length == 0)\n      delete this._events[type];\n  } else if (this._events[type] === listener) {\n    delete this._events[type];\n  }\n\n  return this;\n};\n\nEventEmitter.prototype.removeAllListeners = function(type) {\n  // does not use listeners(), so no side effect of creating _events[type]\n  if (type && this._events && this._events[type]) this._events[type] = null;\n  return this;\n};\n\nEventEmitter.prototype.listeners = function(type) {\n  if (!this._events) this._events = {};\n  if (!this._events[type]) this._events[type] = [];\n  if (!isArray(this._events[type])) {\n    this._events[type] = [this._events[type]];\n  }\n  return this._events[type];\n};\n\n//@ sourceURL=events"
));

require.define("/src/shared/vars.js",Function(['require','module','exports','__dirname','__filename','process','global'],"\"use strict\";\n\n// Identifiers provided by the ECMAScript standard.\n\nexports.reservedVars = {\n\targuments : false,\n\tNaN       : false\n};\n\nexports.ecmaIdentifiers = {\n\tArray              : false,\n\tBoolean            : false,\n\tDate               : false,\n\tdecodeURI          : false,\n\tdecodeURIComponent : false,\n\tencodeURI          : false,\n\tencodeURIComponent : false,\n\tError              : false,\n\t\"eval\"             : false,\n\tEvalError          : false,\n\tFunction           : false,\n\thasOwnProperty     : false,\n\tisFinite           : false,\n\tisNaN              : false,\n\tJSON               : false,\n\tMath               : false,\n\tMap                : false,\n\tNumber             : false,\n\tObject             : false,\n\tparseInt           : false,\n\tparseFloat         : false,\n\tRangeError         : false,\n\tReferenceError     : false,\n\tRegExp             : false,\n\tSet                : false,\n\tString             : false,\n\tSyntaxError        : false,\n\tTypeError          : false,\n\tURIError           : false,\n\tWeakMap            : false\n};\n\n// Global variables commonly provided by a web browser environment.\n\nexports.browser = {\n\tArrayBuffer          : false,\n\tArrayBufferView      : false,\n\tAudio                : false,\n\tBlob                 : false,\n\taddEventListener     : false,\n\tapplicationCache     : false,\n\tatob                 : false,\n\tblur                 : false,\n\tbtoa                 : false,\n\tclearInterval        : false,\n\tclearTimeout         : false,\n\tclose                : false,\n\tclosed               : false,\n\tDataView             : false,\n\tDOMParser            : false,\n\tdefaultStatus        : false,\n\tdocument             : false,\n\tElement              : false,\n\tevent                : false,\n\tFileReader           : false,\n\tFloat32Array         : false,\n\tFloat64Array         : false,\n\tFormData             : false,\n\tfocus                : false,\n\tframes               : false,\n\tgetComputedStyle     : false,\n\tHTMLElement          : false,\n\tHTMLAnchorElement    : false,\n\tHTMLBaseElement      : false,\n\tHTMLBlockquoteElement: false,\n\tHTMLBodyElement      : false,\n\tHTMLBRElement        : false,\n\tHTMLButtonElement    : false,\n\tHTMLCanvasElement    : false,\n\tHTMLDirectoryElement : false,\n\tHTMLDivElement       : false,\n\tHTMLDListElement     : false,\n\tHTMLFieldSetElement  : false,\n\tHTMLFontElement      : false,\n\tHTMLFormElement      : false,\n\tHTMLFrameElement     : false,\n\tHTMLFrameSetElement  : false,\n\tHTMLHeadElement      : false,\n\tHTMLHeadingElement   : false,\n\tHTMLHRElement        : false,\n\tHTMLHtmlElement      : false,\n\tHTMLIFrameElement    : false,\n\tHTMLImageElement     : false,\n\tHTMLInputElement     : false,\n\tHTMLIsIndexElement   : false,\n\tHTMLLabelElement     : false,\n\tHTMLLayerElement     : false,\n\tHTMLLegendElement    : false,\n\tHTMLLIElement        : false,\n\tHTMLLinkElement      : false,\n\tHTMLMapElement       : false,\n\tHTMLMenuElement      : false,\n\tHTMLMetaElement      : false,\n\tHTMLModElement       : false,\n\tHTMLObjectElement    : false,\n\tHTMLOListElement     : false,\n\tHTMLOptGroupElement  : false,\n\tHTMLOptionElement    : false,\n\tHTMLParagraphElement : false,\n\tHTMLParamElement     : false,\n\tHTMLPreElement       : false,\n\tHTMLQuoteElement     : false,\n\tHTMLScriptElement    : false,\n\tHTMLSelectElement    : false,\n\tHTMLStyleElement     : false,\n\tHTMLTableCaptionElement: false,\n\tHTMLTableCellElement : false,\n\tHTMLTableColElement  : false,\n\tHTMLTableElement     : false,\n\tHTMLTableRowElement  : false,\n\tHTMLTableSectionElement: false,\n\tHTMLTextAreaElement  : false,\n\tHTMLTitleElement     : false,\n\tHTMLUListElement     : false,\n\tHTMLVideoElement     : false,\n\thistory              : false,\n\tInt16Array           : false,\n\tInt32Array           : false,\n\tInt8Array            : false,\n\tImage                : false,\n\tlength               : false,\n\tlocalStorage         : false,\n\tlocation             : false,\n\tMessageChannel       : false,\n\tMessageEvent         : false,\n\tMessagePort          : false,\n\tmoveBy               : false,\n\tmoveTo               : false,\n\tMutationObserver     : false,\n\tname                 : false,\n\tNode                 : false,\n\tNodeFilter           : false,\n\tnavigator            : false,\n\tonbeforeunload       : true,\n\tonblur               : true,\n\tonerror              : true,\n\tonfocus              : true,\n\tonload               : true,\n\tonresize             : true,\n\tonunload             : true,\n\topen                 : false,\n\topenDatabase         : false,\n\topener               : false,\n\tOption               : false,\n\tparent               : false,\n\tprint                : false,\n\tremoveEventListener  : false,\n\tresizeBy             : false,\n\tresizeTo             : false,\n\tscreen               : false,\n\tscroll               : false,\n\tscrollBy             : false,\n\tscrollTo             : false,\n\tsessionStorage       : false,\n\tsetInterval          : false,\n\tsetTimeout           : false,\n\tSharedWorker         : false,\n\tstatus               : false,\n\ttop                  : false,\n\tUint16Array          : false,\n\tUint32Array          : false,\n\tUint8Array           : false,\n\tUint8ClampedArray    : false,\n\tWebSocket            : false,\n\twindow               : false,\n\tWorker               : false,\n\tXMLHttpRequest       : false,\n\tXMLSerializer        : false,\n\tXPathEvaluator       : false,\n\tXPathException       : false,\n\tXPathExpression      : false,\n\tXPathNamespace       : false,\n\tXPathNSResolver      : false,\n\tXPathResult          : false\n};\n\nexports.devel = {\n\talert  : false,\n\tconfirm: false,\n\tconsole: false,\n\tDebug  : false,\n\topera  : false,\n\tprompt : false\n};\n\nexports.worker = {\n\timportScripts: true,\n\tpostMessage  : true,\n\tself         : true\n};\n\n// Widely adopted global names that are not part of ECMAScript standard\nexports.nonstandard = {\n\tescape  : false,\n\tunescape: false\n};\n\n// Globals provided by popular JavaScript environments.\n\nexports.couch = {\n\t\"require\" : false,\n\trespond   : false,\n\tgetRow    : false,\n\temit      : false,\n\tsend      : false,\n\tstart     : false,\n\tsum       : false,\n\tlog       : false,\n\texports   : false,\n\tmodule    : false,\n\tprovides  : false\n};\n\nexports.node = {\n\t__filename   : false,\n\t__dirname    : false,\n\tBuffer       : false,\n\tDataView     : false,\n\tconsole      : false,\n\texports      : true,  // In Node it is ok to exports = module.exports = foo();\n\tGLOBAL       : false,\n\tglobal       : false,\n\tmodule       : false,\n\tprocess      : false,\n\trequire      : false,\n\tsetTimeout   : false,\n\tclearTimeout : false,\n\tsetInterval  : false,\n\tclearInterval: false\n};\n\nexports.rhino = {\n\tdefineClass  : false,\n\tdeserialize  : false,\n\tgc           : false,\n\thelp         : false,\n\timportPackage: false,\n\t\"java\"       : false,\n\tload         : false,\n\tloadClass    : false,\n\tprint        : false,\n\tquit         : false,\n\treadFile     : false,\n\treadUrl      : false,\n\trunCommand   : false,\n\tseal         : false,\n\tserialize    : false,\n\tspawn        : false,\n\tsync         : false,\n\ttoint32      : false,\n\tversion      : false\n};\n\nexports.wsh = {\n\tActiveXObject            : true,\n\tEnumerator               : true,\n\tGetObject                : true,\n\tScriptEngine             : true,\n\tScriptEngineBuildVersion : true,\n\tScriptEngineMajorVersion : true,\n\tScriptEngineMinorVersion : true,\n\tVBArray                  : true,\n\tWSH                      : true,\n\tWScript                  : true,\n\tXDomainRequest           : true\n};\n\n// Globals provided by popular JavaScript libraries.\n\nexports.dojo = {\n\tdojo     : false,\n\tdijit    : false,\n\tdojox    : false,\n\tdefine\t : false,\n\t\"require\": false\n};\n\nexports.jquery = {\n\t\"$\"    : false,\n\tjQuery : false\n};\n\nexports.mootools = {\n\t\"$\"           : false,\n\t\"$$\"          : false,\n\tAsset         : false,\n\tBrowser       : false,\n\tChain         : false,\n\tClass         : false,\n\tColor         : false,\n\tCookie        : false,\n\tCore          : false,\n\tDocument      : false,\n\tDomReady      : false,\n\tDOMEvent      : false,\n\tDOMReady      : false,\n\tDrag          : false,\n\tElement       : false,\n\tElements      : false,\n\tEvent         : false,\n\tEvents        : false,\n\tFx            : false,\n\tGroup         : false,\n\tHash          : false,\n\tHtmlTable     : false,\n\tIframe        : false,\n\tIframeShim    : false,\n\tInputValidator: false,\n\tinstanceOf    : false,\n\tKeyboard      : false,\n\tLocale        : false,\n\tMask          : false,\n\tMooTools      : false,\n\tNative        : false,\n\tOptions       : false,\n\tOverText      : false,\n\tRequest       : false,\n\tScroller      : false,\n\tSlick         : false,\n\tSlider        : false,\n\tSortables     : false,\n\tSpinner       : false,\n\tSwiff         : false,\n\tTips          : false,\n\tType          : false,\n\ttypeOf        : false,\n\tURI           : false,\n\tWindow        : false\n};\n\nexports.prototypejs = {\n\t\"$\"               : false,\n\t\"$$\"              : false,\n\t\"$A\"              : false,\n\t\"$F\"              : false,\n\t\"$H\"              : false,\n\t\"$R\"              : false,\n\t\"$break\"          : false,\n\t\"$continue\"       : false,\n\t\"$w\"              : false,\n\tAbstract          : false,\n\tAjax              : false,\n\tClass             : false,\n\tEnumerable        : false,\n\tElement           : false,\n\tEvent             : false,\n\tField             : false,\n\tForm              : false,\n\tHash              : false,\n\tInsertion         : false,\n\tObjectRange       : false,\n\tPeriodicalExecuter: false,\n\tPosition          : false,\n\tPrototype         : false,\n\tSelector          : false,\n\tTemplate          : false,\n\tToggle            : false,\n\tTry               : false,\n\tAutocompleter     : false,\n\tBuilder           : false,\n\tControl           : false,\n\tDraggable         : false,\n\tDraggables        : false,\n\tDroppables        : false,\n\tEffect            : false,\n\tSortable          : false,\n\tSortableObserver  : false,\n\tSound             : false,\n\tScriptaculous     : false\n};\n\nexports.yui = {\n\tYUI       : false,\n\tY         : false,\n\tYUI_config: false\n};\n\n\n//@ sourceURL=/src/shared/vars.js"
));

require.define("/src/shared/messages.js",Function(['require','module','exports','__dirname','__filename','process','global'],"\"use strict\";\n\nvar _ = require(\"underscore\");\n\nvar errors = {\n\t// JSHint options\n\tE001: \"Bad option: '{a}'.\",\n\tE002: \"Bad option value.\",\n\n\t// JSHint input\n\tE003: \"Expected a JSON value.\",\n\tE004: \"Input is neither a string nor an array of strings.\",\n\tE005: \"Input is empty.\",\n\tE006: \"Unexpected early end of program.\",\n\n\t// Strict mode\n\tE007: \"Missing \\\"use strict\\\" statement.\",\n\tE008: \"Strict violation.\",\n\tE009: \"Option 'validthis' can't be used in a global scope.\",\n\tE010: \"'with' is not allowed in strict mode.\",\n\n\t// Constants\n\tE011: \"const '{a}' has already been declared.\",\n\tE012: \"const '{a}' is initialized to 'undefined'.\",\n\tE013: \"Attempting to override '{a}' which is a constant.\",\n\n\t// Regular expressions\n\tE014: \"A regular expression literal can be confused with '/='.\",\n\tE015: \"Unclosed regular expression.\",\n\tE016: \"Invalid regular expression.\",\n\n\t// Tokens\n\tE017: \"Unclosed comment.\",\n\tE018: \"Unbegun comment.\",\n\tE019: \"Unmatched '{a}'.\",\n\tE020: \"Expected '{a}' to match '{b}' from line {c} and instead saw '{d}'.\",\n\tE021: \"Expected '{a}' and instead saw '{b}'.\",\n\tE022: \"Line breaking error '{a}'.\",\n\tE023: \"Missing '{a}'.\",\n\tE024: \"Unexpected '{a}'.\",\n\tE025: \"Missing ':' on a case clause.\",\n\tE026: \"Missing '}' to match '{' from line {a}.\",\n\tE027: \"Missing ']' to match '[' form line {a}.\",\n\tE028: \"Illegal comma.\",\n\tE029: \"Unclosed string.\",\n\n\t// Everything else\n\tE030: \"Expected an identifier and instead saw '{a}'.\",\n\tE031: \"Bad assignment.\", // FIXME: Rephrase\n\tE032: \"Expected a small integer and instead saw '{a}'.\",\n\tE033: \"Expected an operator and instead saw '{a}'.\",\n\tE034: \"get/set are ES5 features.\",\n\tE035: \"Missing property name.\",\n\tE036: \"Expected to see a statement and instead saw a block.\",\n\tE037: \"Constant {a} was not declared correctly.\",\n\tE038: \"Variable {a} was not declared correctly.\",\n\tE039: \"Function declarations are not invocable. Wrap the whole function invocation in parens.\",\n\tE040: \"Each value should have its own case label.\",\n\tE041: \"Unrecoverable syntax error.\",\n\tE042: \"Stopping.\",\n\tE043: \"Too many errors.\"\n};\n\nvar warnings = {\n\tW001: \"'hasOwnProperty' is a really bad name.\",\n\tW002: \"Value of '{a}' may be overwritten in IE.\",\n\tW003: \"'{a}' was used before it was defined.\",\n\tW004: \"'{a}' is already defined.\",\n\tW005: \"A dot following a number can be confused with a decimal point.\",\n\tW006: \"Confusing minuses.\",\n\tW007: \"Confusing pluses.\",\n\tW008: \"A leading decimal point can be confused with a dot: '{a}'.\",\n\tW009: \"The array literal notation [] is preferrable.\",\n\tW010: \"The object literal notation {} is preferrable.\",\n\tW011: \"Unexpected space after '{a}'.\",\n\tW012: \"Unexpected space before '{a}'.\",\n\tW013: \"Missing space after '{a}'.\",\n\tW014: \"Bad line breaking before '{a}'.\",\n\tW015: \"Expected '{a}' to have an indentation at {b} instead at {c}.\",\n\tW016: \"Unexpected use of '{a}'.\",\n\tW017: \"Bad operand.\",\n\tW018: \"Confusing use of '{a}'.\",\n\tW019: \"Use the isNaN function to compare with NaN.\",\n\tW020: \"Read only.\",\n\tW021: \"'{a}' is a function.\",\n\tW022: \"Do not assign to the exception parameter.\",\n\tW023: \"Expected an identifier in an assignment and instead saw a function invocation.\",\n\tW024: \"Expected an identifier and instead saw '{a}' (a reserved word).\",\n\tW025: \"Missing name in function declaration.\",\n\tW026: \"Inner functions should be listed at the top of the outer function.\",\n\tW027: \"Unreachable '{a}' after '{b}'.\",\n\tW028: \"Label '{a}' on {b} statement.\",\n\tW029: \"Label '{a}' looks like a javascript url.\",\n\tW030: \"Expected an assignment or function call and instead saw an expression.\",\n\tW031: \"Do not use 'new' for side effects.\",\n\tW032: \"Unnecessary semicolon.\",\n\tW033: \"Missing semicolon.\",\n\tW034: \"Unnecessary directive \\\"{a}\\\".\",\n\tW035: \"Empty block.\",\n\tW036: \"Unexpected /*member '{a}'.\",\n\tW037: \"'{a}' is a statement label.\",\n\tW038: \"'{a}' used out of scope.\",\n\tW039: \"'{a}' is not allowed.\",\n\tW040: \"Possible strict violation.\",\n\tW041: \"Use '{a}' to compare with '{b}'.\",\n\tW042: \"Avoid EOL escaping.\",\n\tW043: \"Bad escaping of EOL. Use option multistr if needed.\",\n\tW044: \"Bad escaping.\",\n\tW045: \"Bad number '{a}'.\",\n\tW046: \"Don't use extra leading zeros '{a}'.\",\n\tW047: \"A trailing decimal point can be confused with a dot: '{a}'.\",\n\tW048: \"Unexpected control character in regular expression.\",\n\tW049: \"Unexpected escaped character '{a}' in regular expression.\",\n\tW050: \"JavaScript URL.\",\n\tW051: \"Variables should not be deleted.\",\n\tW052: \"Unexpected '{a}'.\",\n\tW053: \"Do not use {a} as a constructor.\",\n\tW054: \"The Function constructor is a form of eval.\",\n\tW055: \"A constructor name should start with an uppercase letter.\",\n\tW056: \"Bad constructor.\",\n\tW057: \"Weird construction. Is 'new' unnecessary?\",\n\tW058: \"Missing '()' invoking a constructor.\",\n\tW059: \"Avoid arguments.{a}.\",\n\tW060: \"document.write can be a form of eval.\",\n\tW061: \"eval can be harmful.\",\n\tW062: \"Wrap an immediate function invocation in parens \" +\n\t\t\"to assist the reader in understanding that the expression \" +\n\t\t\"is the result of a function, and not the function itself.\",\n\tW063: \"Math is not a function.\",\n\tW064: \"Missing 'new' prefix when invoking a constructor.\",\n\tW065: \"Missing radix parameter.\",\n\tW066: \"Implied eval. Consider passing a function instead of a string.\",\n\tW067: \"Bad invocation.\",\n\tW068: \"Wrapping non-IIFE function literals in parens is unnecessary.\",\n\tW069: \"['{a}'] is better written in dot notation.\",\n\tW070: \"Extra comma. (it breaks older versions of IE)\",\n\tW071: \"This function has too many statements. ({a})\",\n\tW072: \"This function has too many parameters. ({a})\",\n\tW073: \"Blocks are nested too deeply. ({a})\",\n\tW074: \"This function's cyclomatic complexity is too high. ({a})\",\n\tW075: \"Duplicate key '{a}'.\",\n\tW076: \"Unexpected parameter '{a}' in get {b} function.\",\n\tW077: \"Expected a single parameter in set {a} function.\",\n\tW078: \"Setter is defined without getter.\",\n\tW079: \"Redefinition of '{a}'.\",\n\tW080: \"It's not necessary to initialize '{a}' to 'undefined'.\",\n\tW081: \"Too many var statements.\",\n\tW082: \"Function declarations should not be placed in blocks. \" +\n\t\t\"Use a function expression or move the statement to the top of \" +\n\t\t\"the outer function.\",\n\tW083: \"Don't make functions within a loop.\",\n\tW084: \"Expected a conditional expression and instead saw an assignment.\",\n\tW085: \"Don't use 'with'.\",\n\tW086: \"Expected a 'break' statement before '{a}'.\",\n\tW087: \"Forgotten 'debugger' statement?\",\n\tW088: \"Creating global 'for' variable. Should be 'for (var {a} ...'.\",\n\tW089: \"The body of a for in should be wrapped in an if statement to filter \" +\n\t\t\"unwanted properties from the prototype.\",\n\tW090: \"'{a}' is not a statement label.\",\n\tW091: \"'{a}' is out of scope.\",\n\tW092: \"Wrap the /regexp/ literal in parens to disambiguate the slash operator.\",\n\tW093: \"Did you mean to return a conditional instead of an assignment?\",\n\tW094: \"Unexpected comma.\",\n\tW095: \"Expected a string and instead saw {a}.\",\n\tW096: \"The '{a}' key may produce unexpected results.\",\n\tW097: \"Use the function form of \\\"use strict\\\".\",\n\tW098: \"'{a}' is defined but never used.\",\n\tW099: \"Mixed spaces and tabs.\",\n\tW100: \"This character may get silently deleted by one or more browsers.\",\n\tW101: \"Line is too long.\",\n\tW102: \"Trailing whitespace.\",\n\tW103: \"The '{a}' property is deprecated.\",\n\tW104: \"'{a}' is only available in JavaScript 1.7.\",\n\tW105: \"Unexpected {a} in '{b}'.\",\n\tW106: \"Identifier '{a}' is not in camel case.\",\n\tW107: \"Script URL.\",\n\tW108: \"Strings must use doublequote.\",\n\tW109: \"Strings must use singlequote.\",\n\tW110: \"Mixed double and single quotes.\",\n\tW112: \"Unclosed string.\",\n\tW113: \"Control character in string: {a}.\",\n\tW114: \"Avoid {a}.\",\n\tW115: \"Octal literals are not allowed in strict mode.\",\n\tW116: \"Expected '{a}' and instead saw '{b}'.\",\n\tW117: \"'{a}' is not defined.\",\n};\n\nvar info = {\n\tI001: \"Comma warnings can be turned off with 'laxcomma'.\"\n};\n\nexports.errors = {};\nexports.warnings = {};\nexports.info = {};\n\n_.each(errors, function (desc, code) {\n\texports.errors[code] = { code: code, desc: desc };\n});\n\n_.each(warnings, function (desc, code) {\n\texports.warnings[code] = { code: code, desc: desc };\n});\n\n_.each(info, function (desc, code) {\n\texports.info[code] = { code: code, desc: desc };\n});\n\n//@ sourceURL=/src/shared/messages.js"
));

require.define("/src/stable/lex.js",Function(['require','module','exports','__dirname','__filename','process','global'],"/*\n * Lexical analysis and token construction.\n */\n\n\"use strict\";\n\nvar _      = require(\"underscore\");\nvar events = require(\"events\");\nvar reg    = require(\"./reg.js\");\nvar state  = require(\"./state.js\").state;\n\n// Some of these token types are from JavaScript Parser API\n// while others are specific to JSHint parser.\n// JS Parser API: https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API\n\nvar Token = {\n\tIdentifier: 1,\n\tPunctuator: 2,\n\tNumericLiteral: 3,\n\tStringLiteral: 4,\n\tComment: 5,\n\tKeyword: 6,\n\tNullLiteral: 7,\n\tBooleanLiteral: 8,\n\tRegExp: 9\n};\n\n// This is auto generated from the unicode tables.\n// The tables are at:\n// http://www.fileformat.info/info/unicode/category/Lu/list.htm\n// http://www.fileformat.info/info/unicode/category/Ll/list.htm\n// http://www.fileformat.info/info/unicode/category/Lt/list.htm\n// http://www.fileformat.info/info/unicode/category/Lm/list.htm\n// http://www.fileformat.info/info/unicode/category/Lo/list.htm\n// http://www.fileformat.info/info/unicode/category/Nl/list.htm\n\nvar unicodeLetterTable = [\n\t170, 170, 181, 181, 186, 186, 192, 214,\n\t216, 246, 248, 705, 710, 721, 736, 740, 748, 748, 750, 750,\n\t880, 884, 886, 887, 890, 893, 902, 902, 904, 906, 908, 908,\n\t910, 929, 931, 1013, 1015, 1153, 1162, 1319, 1329, 1366,\n\t1369, 1369, 1377, 1415, 1488, 1514, 1520, 1522, 1568, 1610,\n\t1646, 1647, 1649, 1747, 1749, 1749, 1765, 1766, 1774, 1775,\n\t1786, 1788, 1791, 1791, 1808, 1808, 1810, 1839, 1869, 1957,\n\t1969, 1969, 1994, 2026, 2036, 2037, 2042, 2042, 2048, 2069,\n\t2074, 2074, 2084, 2084, 2088, 2088, 2112, 2136, 2308, 2361,\n\t2365, 2365, 2384, 2384, 2392, 2401, 2417, 2423, 2425, 2431,\n\t2437, 2444, 2447, 2448, 2451, 2472, 2474, 2480, 2482, 2482,\n\t2486, 2489, 2493, 2493, 2510, 2510, 2524, 2525, 2527, 2529,\n\t2544, 2545, 2565, 2570, 2575, 2576, 2579, 2600, 2602, 2608,\n\t2610, 2611, 2613, 2614, 2616, 2617, 2649, 2652, 2654, 2654,\n\t2674, 2676, 2693, 2701, 2703, 2705, 2707, 2728, 2730, 2736,\n\t2738, 2739, 2741, 2745, 2749, 2749, 2768, 2768, 2784, 2785,\n\t2821, 2828, 2831, 2832, 2835, 2856, 2858, 2864, 2866, 2867,\n\t2869, 2873, 2877, 2877, 2908, 2909, 2911, 2913, 2929, 2929,\n\t2947, 2947, 2949, 2954, 2958, 2960, 2962, 2965, 2969, 2970,\n\t2972, 2972, 2974, 2975, 2979, 2980, 2984, 2986, 2990, 3001,\n\t3024, 3024, 3077, 3084, 3086, 3088, 3090, 3112, 3114, 3123,\n\t3125, 3129, 3133, 3133, 3160, 3161, 3168, 3169, 3205, 3212,\n\t3214, 3216, 3218, 3240, 3242, 3251, 3253, 3257, 3261, 3261,\n\t3294, 3294, 3296, 3297, 3313, 3314, 3333, 3340, 3342, 3344,\n\t3346, 3386, 3389, 3389, 3406, 3406, 3424, 3425, 3450, 3455,\n\t3461, 3478, 3482, 3505, 3507, 3515, 3517, 3517, 3520, 3526,\n\t3585, 3632, 3634, 3635, 3648, 3654, 3713, 3714, 3716, 3716,\n\t3719, 3720, 3722, 3722, 3725, 3725, 3732, 3735, 3737, 3743,\n\t3745, 3747, 3749, 3749, 3751, 3751, 3754, 3755, 3757, 3760,\n\t3762, 3763, 3773, 3773, 3776, 3780, 3782, 3782, 3804, 3805,\n\t3840, 3840, 3904, 3911, 3913, 3948, 3976, 3980, 4096, 4138,\n\t4159, 4159, 4176, 4181, 4186, 4189, 4193, 4193, 4197, 4198,\n\t4206, 4208, 4213, 4225, 4238, 4238, 4256, 4293, 4304, 4346,\n\t4348, 4348, 4352, 4680, 4682, 4685, 4688, 4694, 4696, 4696,\n\t4698, 4701, 4704, 4744, 4746, 4749, 4752, 4784, 4786, 4789,\n\t4792, 4798, 4800, 4800, 4802, 4805, 4808, 4822, 4824, 4880,\n\t4882, 4885, 4888, 4954, 4992, 5007, 5024, 5108, 5121, 5740,\n\t5743, 5759, 5761, 5786, 5792, 5866, 5870, 5872, 5888, 5900,\n\t5902, 5905, 5920, 5937, 5952, 5969, 5984, 5996, 5998, 6000,\n\t6016, 6067, 6103, 6103, 6108, 6108, 6176, 6263, 6272, 6312,\n\t6314, 6314, 6320, 6389, 6400, 6428, 6480, 6509, 6512, 6516,\n\t6528, 6571, 6593, 6599, 6656, 6678, 6688, 6740, 6823, 6823,\n\t6917, 6963, 6981, 6987, 7043, 7072, 7086, 7087, 7104, 7141,\n\t7168, 7203, 7245, 7247, 7258, 7293, 7401, 7404, 7406, 7409,\n\t7424, 7615, 7680, 7957, 7960, 7965, 7968, 8005, 8008, 8013,\n\t8016, 8023, 8025, 8025, 8027, 8027, 8029, 8029, 8031, 8061,\n\t8064, 8116, 8118, 8124, 8126, 8126, 8130, 8132, 8134, 8140,\n\t8144, 8147, 8150, 8155, 8160, 8172, 8178, 8180, 8182, 8188,\n\t8305, 8305, 8319, 8319, 8336, 8348, 8450, 8450, 8455, 8455,\n\t8458, 8467, 8469, 8469, 8473, 8477, 8484, 8484, 8486, 8486,\n\t8488, 8488, 8490, 8493, 8495, 8505, 8508, 8511, 8517, 8521,\n\t8526, 8526, 8544, 8584, 11264, 11310, 11312, 11358,\n\t11360, 11492, 11499, 11502, 11520, 11557, 11568, 11621,\n\t11631, 11631, 11648, 11670, 11680, 11686, 11688, 11694,\n\t11696, 11702, 11704, 11710, 11712, 11718, 11720, 11726,\n\t11728, 11734, 11736, 11742, 11823, 11823, 12293, 12295,\n\t12321, 12329, 12337, 12341, 12344, 12348, 12353, 12438,\n\t12445, 12447, 12449, 12538, 12540, 12543, 12549, 12589,\n\t12593, 12686, 12704, 12730, 12784, 12799, 13312, 13312,\n\t19893, 19893, 19968, 19968, 40907, 40907, 40960, 42124,\n\t42192, 42237, 42240, 42508, 42512, 42527, 42538, 42539,\n\t42560, 42606, 42623, 42647, 42656, 42735, 42775, 42783,\n\t42786, 42888, 42891, 42894, 42896, 42897, 42912, 42921,\n\t43002, 43009, 43011, 43013, 43015, 43018, 43020, 43042,\n\t43072, 43123, 43138, 43187, 43250, 43255, 43259, 43259,\n\t43274, 43301, 43312, 43334, 43360, 43388, 43396, 43442,\n\t43471, 43471, 43520, 43560, 43584, 43586, 43588, 43595,\n\t43616, 43638, 43642, 43642, 43648, 43695, 43697, 43697,\n\t43701, 43702, 43705, 43709, 43712, 43712, 43714, 43714,\n\t43739, 43741, 43777, 43782, 43785, 43790, 43793, 43798,\n\t43808, 43814, 43816, 43822, 43968, 44002, 44032, 44032,\n\t55203, 55203, 55216, 55238, 55243, 55291, 63744, 64045,\n\t64048, 64109, 64112, 64217, 64256, 64262, 64275, 64279,\n\t64285, 64285, 64287, 64296, 64298, 64310, 64312, 64316,\n\t64318, 64318, 64320, 64321, 64323, 64324, 64326, 64433,\n\t64467, 64829, 64848, 64911, 64914, 64967, 65008, 65019,\n\t65136, 65140, 65142, 65276, 65313, 65338, 65345, 65370,\n\t65382, 65470, 65474, 65479, 65482, 65487, 65490, 65495,\n\t65498, 65500, 65536, 65547, 65549, 65574, 65576, 65594,\n\t65596, 65597, 65599, 65613, 65616, 65629, 65664, 65786,\n\t65856, 65908, 66176, 66204, 66208, 66256, 66304, 66334,\n\t66352, 66378, 66432, 66461, 66464, 66499, 66504, 66511,\n\t66513, 66517, 66560, 66717, 67584, 67589, 67592, 67592,\n\t67594, 67637, 67639, 67640, 67644, 67644, 67647, 67669,\n\t67840, 67861, 67872, 67897, 68096, 68096, 68112, 68115,\n\t68117, 68119, 68121, 68147, 68192, 68220, 68352, 68405,\n\t68416, 68437, 68448, 68466, 68608, 68680, 69635, 69687,\n\t69763, 69807, 73728, 74606, 74752, 74850, 77824, 78894,\n\t92160, 92728, 110592, 110593, 119808, 119892, 119894, 119964,\n\t119966, 119967, 119970, 119970, 119973, 119974, 119977, 119980,\n\t119982, 119993, 119995, 119995, 119997, 120003, 120005, 120069,\n\t120071, 120074, 120077, 120084, 120086, 120092, 120094, 120121,\n\t120123, 120126, 120128, 120132, 120134, 120134, 120138, 120144,\n\t120146, 120485, 120488, 120512, 120514, 120538, 120540, 120570,\n\t120572, 120596, 120598, 120628, 120630, 120654, 120656, 120686,\n\t120688, 120712, 120714, 120744, 120746, 120770, 120772, 120779,\n\t131072, 131072, 173782, 173782, 173824, 173824, 177972, 177972,\n\t177984, 177984, 178205, 178205, 194560, 195101\n];\n\nvar identifierStartTable = [];\n\nfor (var i = 0; i < 128; i++) {\n\tidentifierStartTable[i] =\n\t\ti === 36 ||           // $\n\t\ti >= 65 && i <= 90 || // A-Z\n\t\ti === 95 ||           // _\n\t\ti >= 97 && i <= 122;  // a-z\n}\n\nvar identifierPartTable = [];\n\nfor (var i = 0; i < 128; i++) {\n\tidentifierPartTable[i] =\n\t\tidentifierStartTable[i] || // $, _, A-Z, a-z\n\t\ti >= 48 && i <= 57;        // 0-9\n}\n\n/*\n * Lexer for JSHint.\n *\n * This object does a char-by-char scan of the provided source code\n * and produces a sequence of tokens.\n *\n *   var lex = new Lexer(\"var i = 0;\");\n *   lex.start();\n *   lex.token(); // returns the next token\n *\n * You have to use the token() method to move the lexer forward\n * but you don't have to use its return value to get tokens. In addition\n * to token() method returning the next token, the Lexer object also\n * emits events.\n *\n *   lex.on(\"Identifier\", function (data) {\n *     if (data.name.indexOf(\"_\") >= 0) {\n *       // Produce a warning.\n *     }\n *   });\n *\n * Note that the token() method returns tokens in a JSLint-compatible\n * format while the event emitter uses a slightly modified version of\n * Mozilla's JavaScript Parser API. Eventually, we will move away from\n * JSLint format.\n */\nfunction Lexer(source) {\n\tvar lines = source;\n\n\tif (typeof lines === \"string\") {\n\t\tlines = lines\n\t\t\t.replace(/\\r\\n/g, \"\\n\")\n\t\t\t.replace(/\\r/g, \"\\n\")\n\t\t\t.split(\"\\n\");\n\t}\n\n\t// If the first line is a shebang (#!), make it a blank and move on.\n\t// Shebangs are used by Node scripts.\n\n\tif (lines[0] && lines[0].substr(0, 2) === \"#!\") {\n\t\tlines[0] = \"\";\n\t}\n\n\tthis.emitter = new events.EventEmitter();\n\tthis.source = source;\n\tthis.lines = lines;\n\tthis.prereg = true;\n\n\tthis.line = 0;\n\tthis.char = 1;\n\tthis.from = 1;\n\tthis.input = \"\";\n\n\tfor (var i = 0; i < state.option.indent; i += 1) {\n\t\tstate.tab += \" \";\n\t}\n}\n\nLexer.prototype = {\n\t_lines: [],\n\n\tget lines() {\n\t\tthis._lines = state.lines;\n\t\treturn this._lines;\n\t},\n\n\tset lines(val) {\n\t\tthis._lines = val;\n\t\tstate.lines = this._lines;\n\t},\n\n\t/*\n\t * Return the next i character without actually moving the\n\t * char pointer.\n\t */\n\tpeek: function (i) {\n\t\treturn this.input.charAt(i || 0);\n\t},\n\n\t/*\n\t * Move the char pointer forward i times.\n\t */\n\tskip: function (i) {\n\t\ti = i || 1;\n\t\tthis.char += i;\n\t\tthis.input = this.input.slice(i);\n\t},\n\n\t/*\n\t * Subscribe to a token event. The API for this method is similar\n\t * Underscore.js i.e. you can subscribe to multiple events with\n\t * one call:\n\t *\n\t *   lex.on(\"Identifier Number\", function (data) {\n\t *     // ...\n\t *   });\n\t */\n\ton: function (names, listener) {\n\t\tnames.split(\" \").forEach(function (name) {\n\t\t\tthis.emitter.on(name, listener);\n\t\t}.bind(this));\n\t},\n\n\t/*\n\t * Trigger a token event. All arguments will be passed to each\n\t * listener.\n\t */\n\ttrigger: function () {\n\t\tthis.emitter.emit.apply(this.emitter, Array.prototype.slice.call(arguments));\n\t},\n\n\t/*\n\t * Extract a punctuator out of the next sequence of characters\n\t * or return 'null' if its not possible.\n\t *\n\t * This method's implementation was heavily influenced by the\n\t * scanPunctuator function in the Esprima parser's source code.\n\t */\n\tscanPunctuator: function () {\n\t\tvar ch1 = this.peek();\n\t\tvar ch2, ch3, ch4;\n\n\t\tswitch (ch1) {\n\t\t// Most common single-character punctuators\n\t\tcase \".\":\n\t\t\tif ((/^[0-9]$/).test(this.peek(1))) {\n\t\t\t\treturn null;\n\t\t\t}\n\n\t\t\t/* falls through */\n\t\tcase \"(\":\n\t\tcase \")\":\n\t\tcase \";\":\n\t\tcase \",\":\n\t\tcase \"{\":\n\t\tcase \"}\":\n\t\tcase \"[\":\n\t\tcase \"]\":\n\t\tcase \":\":\n\t\tcase \"~\":\n\t\tcase \"?\":\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: ch1\n\t\t\t};\n\n\t\t// A pound sign (for Node shebangs)\n\t\tcase \"#\":\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: ch1\n\t\t\t};\n\n\t\t// We're at the end of input\n\t\tcase \"\":\n\t\t\treturn null;\n\t\t}\n\n\t\t// Peek more characters\n\n\t\tch2 = this.peek(1);\n\t\tch3 = this.peek(2);\n\t\tch4 = this.peek(3);\n\n\t\t// 4-character punctuator: >>>=\n\n\t\tif (ch1 === \">\" && ch2 === \">\" && ch3 === \">\" && ch4 === \"=\") {\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: \">>>=\"\n\t\t\t};\n\t\t}\n\n\t\t// 3-character punctuators: === !== >>> <<= >>=\n\n\t\tif (ch1 === \"=\" && ch2 === \"=\" && ch3 === \"=\") {\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: \"===\"\n\t\t\t};\n\t\t}\n\n\t\tif (ch1 === \"!\" && ch2 === \"=\" && ch3 === \"=\") {\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: \"!==\"\n\t\t\t};\n\t\t}\n\n\t\tif (ch1 === \">\" && ch2 === \">\" && ch3 === \">\") {\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: \">>>\"\n\t\t\t};\n\t\t}\n\n\t\tif (ch1 === \"<\" && ch2 === \"<\" && ch3 === \"=\") {\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: \"<<=\"\n\t\t\t};\n\t\t}\n\n\t\tif (ch1 === \">\" && ch2 === \">\" && ch3 === \"=\") {\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: \"<<=\"\n\t\t\t};\n\t\t}\n\n\t\t// 2-character punctuators: <= >= == != ++ -- << >> && ||\n\t\t// += -= *= %= &= |= ^= (but not /=, see below)\n\t\tif (ch1 === ch2 && (\"+-<>&|\".indexOf(ch1) >= 0)) {\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: ch1 + ch2\n\t\t\t};\n\t\t}\n\n\t\tif (\"<>=!+-*%&|^\".indexOf(ch1) >= 0) {\n\t\t\tif (ch2 === \"=\") {\n\t\t\t\treturn {\n\t\t\t\t\ttype: Token.Punctuator,\n\t\t\t\t\tvalue: ch1 + ch2\n\t\t\t\t};\n\t\t\t}\n\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: ch1\n\t\t\t};\n\t\t}\n\n\t\t// Special case: /=. We need to make sure that this is an\n\t\t// operator and not a regular expression.\n\n\t\tif (ch1 === \"/\") {\n\t\t\tif (ch2 === \"=\" && /\\/=(?!(\\S*\\/[gim]?))/.test(this.input)) {\n\t\t\t\t// /= is not a part of a regular expression, return it as a\n\t\t\t\t// punctuator.\n\t\t\t\treturn {\n\t\t\t\t\ttype: Token.Punctuator,\n\t\t\t\t\tvalue: \"/=\"\n\t\t\t\t};\n\t\t\t}\n\n\t\t\treturn {\n\t\t\t\ttype: Token.Punctuator,\n\t\t\t\tvalue: \"/\"\n\t\t\t};\n\t\t}\n\n\t\treturn null;\n\t},\n\n\t/*\n\t * Extract a comment out of the next sequence of characters and/or\n\t * lines or return 'null' if its not possible. Since comments can\n\t * span across multiple lines this method has to move the char\n\t * pointer.\n\t *\n\t * In addition to normal JavaScript comments (// and /*) this method\n\t * also recognizes JSHint- and JSLint-specific comments such as\n\t * /*jshint, /*jslint, /*globals and so on.\n\t */\n\tscanComments: function () {\n\t\tvar ch1 = this.peek();\n\t\tvar ch2 = this.peek(1);\n\t\tvar rest = this.input.substr(2);\n\t\tvar startLine = this.line;\n\t\tvar startChar = this.char;\n\n\t\t// Create a comment token object and make sure it\n\t\t// has all the data JSHint needs to work with special\n\t\t// comments.\n\n\t\tfunction commentToken(label, body, opt) {\n\t\t\tvar special = [\"jshint\", \"jslint\", \"members\", \"member\", \"globals\", \"global\", \"exported\"];\n\t\t\tvar isSpecial = false;\n\t\t\tvar value = label + body;\n\t\t\tvar commentType = \"plain\";\n\t\t\topt = opt || {};\n\n\t\t\tif (opt.isMultiline) {\n\t\t\t\tvalue += \"*/\";\n\t\t\t}\n\n\t\t\tspecial.forEach(function (str) {\n\t\t\t\tif (isSpecial) {\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\tif (body.substr(0, str.length) === str) {\n\t\t\t\t\tisSpecial = true;\n\t\t\t\t\tlabel = label + str;\n\t\t\t\t\tbody = body.substr(str.length);\n\t\t\t\t}\n\n\t\t\t\tif (!isSpecial && body.charAt(0) === \" \" && body.substr(1, str.length) === str) {\n\t\t\t\t\tisSpecial = true;\n\t\t\t\t\tlabel = label + \" \" + str;\n\t\t\t\t\tbody = body.substr(str.length + 1);\n\t\t\t\t}\n\n\t\t\t\tif (!isSpecial) {\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\tswitch (str) {\n\t\t\t\tcase \"member\":\n\t\t\t\t\tcommentType = \"members\";\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"global\":\n\t\t\t\t\tcommentType = \"globals\";\n\t\t\t\t\tbreak;\n\t\t\t\tdefault:\n\t\t\t\t\tcommentType = str;\n\t\t\t\t}\n\t\t\t});\n\n\t\t\treturn {\n\t\t\t\ttype: Token.Comment,\n\t\t\t\tcommentType: commentType,\n\t\t\t\tvalue: value,\n\t\t\t\tbody: body,\n\t\t\t\tisSpecial: isSpecial,\n\t\t\t\tisMultiline: opt.isMultiline || false,\n\t\t\t\tisMalformed: opt.isMalformed || false\n\t\t\t};\n\t\t}\n\n\t\t// End of unbegun comment. Raise an error and skip that input.\n\t\tif (ch1 === \"*\" && ch2 === \"/\") {\n\t\t\tthis.trigger(\"error\", {\n\t\t\t\tcode: \"E018\",\n\t\t\t\tline: startLine,\n\t\t\t\tcharacter: startChar\n\t\t\t});\n\n\t\t\tthis.skip(2);\n\t\t\treturn null;\n\t\t}\n\n\t\t// Comments must start either with // or /*\n\t\tif (ch1 !== \"/\" || (ch2 !== \"*\" && ch2 !== \"/\")) {\n\t\t\treturn null;\n\t\t}\n\n\t\t// One-line comment\n\t\tif (ch2 === \"/\") {\n\t\t\tthis.skip(this.input.length); // Skip to the EOL.\n\t\t\treturn commentToken(\"//\", rest);\n\t\t}\n\n\t\tvar body = \"\";\n\n\t\t/* Multi-line comment */\n\t\tif (ch2 === \"*\") {\n\t\t\tthis.skip(2);\n\n\t\t\twhile (this.peek() !== \"*\" || this.peek(1) !== \"/\") {\n\t\t\t\tif (this.peek() === \"\") { // End of Line\n\t\t\t\t\tbody += \"\\n\";\n\n\t\t\t\t\t// If we hit EOF and our comment is still unclosed,\n\t\t\t\t\t// trigger an error and end the comment implicitly.\n\t\t\t\t\tif (!this.nextLine()) {\n\t\t\t\t\t\tthis.trigger(\"error\", {\n\t\t\t\t\t\t\tcode: \"E017\",\n\t\t\t\t\t\t\tline: startLine,\n\t\t\t\t\t\t\tcharacter: startChar\n\t\t\t\t\t\t});\n\n\t\t\t\t\t\treturn commentToken(\"/*\", body, {\n\t\t\t\t\t\t\tisMultiline: true,\n\t\t\t\t\t\t\tisMalformed: true\n\t\t\t\t\t\t});\n\t\t\t\t\t}\n\t\t\t\t} else {\n\t\t\t\t\tbody += this.peek();\n\t\t\t\t\tthis.skip();\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tthis.skip(2);\n\t\t\treturn commentToken(\"/*\", body, { isMultiline: true });\n\t\t}\n\t},\n\n\t/*\n\t * Extract a keyword out of the next sequence of characters or\n\t * return 'null' if its not possible.\n\t */\n\tscanKeyword: function () {\n\t\tvar result = /^[a-zA-Z_$][a-zA-Z0-9_$]*/.exec(this.input);\n\t\tvar keywords = [\n\t\t\t\"if\", \"in\", \"do\", \"var\", \"for\", \"new\",\n\t\t\t\"try\", \"let\", \"this\", \"else\", \"case\",\n\t\t\t\"void\", \"with\", \"enum\", \"while\", \"break\",\n\t\t\t\"catch\", \"throw\", \"const\", \"yield\", \"class\",\n\t\t\t\"super\", \"return\", \"typeof\", \"delete\",\n\t\t\t\"switch\", \"export\", \"import\", \"default\",\n\t\t\t\"finally\", \"extends\", \"function\", \"continue\",\n\t\t\t\"debugger\", \"instanceof\"\n\t\t];\n\n\t\tif (result && keywords.indexOf(result[0]) >= 0) {\n\t\t\treturn {\n\t\t\t\ttype: Token.Keyword,\n\t\t\t\tvalue: result[0]\n\t\t\t};\n\t\t}\n\n\t\treturn null;\n\t},\n\n\t/*\n\t * Extract a JavaScript identifier out of the next sequence of\n\t * characters or return 'null' if its not possible. In addition,\n\t * to Identifier this method can also produce BooleanLiteral\n\t * (true/false) and NullLiteral (null).\n\t */\n\tscanIdentifier: function () {\n\t\tvar id = \"\";\n\t\tvar index = 0;\n\t\tvar type, char;\n\n\t\t// Detects any character in the Unicode categories \"Uppercase\n\t\t// letter (Lu)\", \"Lowercase letter (Ll)\", \"Titlecase letter\n\t\t// (Lt)\", \"Modifier letter (Lm)\", \"Other letter (Lo)\", or\n\t\t// \"Letter number (Nl)\".\n\t\t//\n\t\t// Both approach and unicodeLetterTable were borrowed from\n\t\t// Google's Traceur.\n\n\t\tfunction isUnicodeLetter(code) {\n\t\t\tfor (var i = 0; i < unicodeLetterTable.length;) {\n\t\t\t\tif (code < unicodeLetterTable[i++]) {\n\t\t\t\t\treturn false;\n\t\t\t\t}\n\n\t\t\t\tif (code <= unicodeLetterTable[i++]) {\n\t\t\t\t\treturn true;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\treturn false;\n\t\t}\n\n\t\tfunction isHexDigit(str) {\n\t\t\treturn (/^[0-9a-fA-F]$/).test(str);\n\t\t}\n\n\t\tvar readUnicodeEscapeSequence = function () {\n\t\t\t/*jshint validthis:true */\n\t\t\tindex += 1;\n\n\t\t\tif (this.peek(index) !== \"u\") {\n\t\t\t\treturn null;\n\t\t\t}\n\n\t\t\tvar ch1 = this.peek(index + 1);\n\t\t\tvar ch2 = this.peek(index + 2);\n\t\t\tvar ch3 = this.peek(index + 3);\n\t\t\tvar ch4 = this.peek(index + 4);\n\t\t\tvar code;\n\n\t\t\tif (isHexDigit(ch1) && isHexDigit(ch2) && isHexDigit(ch3) && isHexDigit(ch4)) {\n\t\t\t\tcode = parseInt(ch1 + ch2 + ch3 + ch4, 16);\n\n\t\t\t\tif (isUnicodeLetter(code)) {\n\t\t\t\t\tindex += 5;\n\t\t\t\t\treturn \"\\\\u\" + ch1 + ch2 + ch3 + ch4;\n\t\t\t\t}\n\n\t\t\t\treturn null;\n\t\t\t}\n\n\t\t\treturn null;\n\t\t}.bind(this);\n\n\t\tvar getIdentifierStart = function () {\n\t\t\t/*jshint validthis:true */\n\t\t\tvar chr = this.peek(index);\n\t\t\tvar code = chr.charCodeAt(0);\n\n\t\t\tif (code === 92) {\n\t\t\t\treturn readUnicodeEscapeSequence();\n\t\t\t}\n\n\t\t\tif (code < 128) {\n\t\t\t\tif (identifierStartTable[code]) {\n\t\t\t\t\tindex += 1;\n\t\t\t\t\treturn chr;\n\t\t\t\t}\n\n\t\t\t\treturn null;\n\t\t\t}\n\n\t\t\tif (isUnicodeLetter(code)) {\n\t\t\t\tindex += 1;\n\t\t\t\treturn chr;\n\t\t\t}\n\n\t\t\treturn null;\n\t\t}.bind(this);\n\n\t\tvar getIdentifierPart = function () {\n\t\t\t/*jshint validthis:true */\n\t\t\tvar chr = this.peek(index);\n\t\t\tvar code = chr.charCodeAt(0);\n\n\t\t\tif (code === 92) {\n\t\t\t\treturn readUnicodeEscapeSequence();\n\t\t\t}\n\n\t\t\tif (code < 128) {\n\t\t\t\tif (identifierPartTable[code]) {\n\t\t\t\t\tindex += 1;\n\t\t\t\t\treturn chr;\n\t\t\t\t}\n\n\t\t\t\treturn null;\n\t\t\t}\n\n\t\t\tif (isUnicodeLetter(code)) {\n\t\t\t\tindex += 1;\n\t\t\t\treturn chr;\n\t\t\t}\n\n\t\t\treturn null;\n\t\t}.bind(this);\n\n\t\tchar = getIdentifierStart();\n\t\tif (char === null) {\n\t\t\treturn null;\n\t\t}\n\n\t\tid = char;\n\t\tfor (;;) {\n\t\t\tchar = getIdentifierPart();\n\n\t\t\tif (char === null) {\n\t\t\t\tbreak;\n\t\t\t}\n\n\t\t\tid += char;\n\t\t}\n\n\t\tswitch (id) {\n\t\tcase \"true\":\n\t\tcase \"false\":\n\t\t\ttype = Token.BooleanLiteral;\n\t\t\tbreak;\n\t\tcase \"null\":\n\t\t\ttype = Token.NullLiteral;\n\t\t\tbreak;\n\t\tdefault:\n\t\t\ttype = Token.Identifier;\n\t\t}\n\n\t\treturn {\n\t\t\ttype: type,\n\t\t\tvalue: id\n\t\t};\n\t},\n\n\t/*\n\t * Extract a numeric literal out of the next sequence of\n\t * characters or return 'null' if its not possible. This method\n\t * supports all numeric literals described in section 7.8.3\n\t * of the EcmaScript 5 specification.\n\t *\n\t * This method's implementation was heavily influenced by the\n\t * scanNumericLiteral function in the Esprima parser's source code.\n\t */\n\tscanNumericLiteral: function () {\n\t\tvar index = 0;\n\t\tvar value = \"\";\n\t\tvar length = this.input.length;\n\t\tvar char = this.peek(index);\n\t\tvar bad;\n\n\t\tfunction isDecimalDigit(str) {\n\t\t\treturn (/^[0-9]$/).test(str);\n\t\t}\n\n\t\tfunction isOctalDigit(str) {\n\t\t\treturn (/^[0-7]$/).test(str);\n\t\t}\n\n\t\tfunction isHexDigit(str) {\n\t\t\treturn (/^[0-9a-fA-F]$/).test(str);\n\t\t}\n\n\t\tfunction isIdentifierStart(ch) {\n\t\t\treturn (ch === \"$\") || (ch === \"_\") || (ch === \"\\\\\") ||\n\t\t\t\t(ch >= \"a\" && ch <= \"z\") || (ch >= \"A\" && ch <= \"Z\");\n\t\t}\n\n\t\t// Numbers must start either with a decimal digit or a point.\n\n\t\tif (char !== \".\" && !isDecimalDigit(char)) {\n\t\t\treturn null;\n\t\t}\n\n\t\tif (char !== \".\") {\n\t\t\tvalue = this.peek(index);\n\t\t\tindex += 1;\n\t\t\tchar = this.peek(index);\n\n\t\t\tif (value === \"0\") {\n\t\t\t\t// Base-16 numbers.\n\t\t\t\tif (char === \"x\" || char === \"X\") {\n\t\t\t\t\tindex += 1;\n\t\t\t\t\tvalue += char;\n\n\t\t\t\t\twhile (index < length) {\n\t\t\t\t\t\tchar = this.peek(index);\n\t\t\t\t\t\tif (!isHexDigit(char)) {\n\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\t}\n\t\t\t\t\t\tvalue += char;\n\t\t\t\t\t\tindex += 1;\n\t\t\t\t\t}\n\n\t\t\t\t\tif (value.length <= 2) { // 0x\n\t\t\t\t\t\treturn {\n\t\t\t\t\t\t\ttype: Token.NumericLiteral,\n\t\t\t\t\t\t\tvalue: value,\n\t\t\t\t\t\t\tisMalformed: true\n\t\t\t\t\t\t};\n\t\t\t\t\t}\n\n\t\t\t\t\tif (index < length) {\n\t\t\t\t\t\tchar = this.peek(index);\n\t\t\t\t\t\tif (isIdentifierStart(char)) {\n\t\t\t\t\t\t\treturn null;\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\n\t\t\t\t\treturn {\n\t\t\t\t\t\ttype: Token.NumericLiteral,\n\t\t\t\t\t\tvalue: value,\n\t\t\t\t\t\tbase: 16,\n\t\t\t\t\t\tisMalformed: false\n\t\t\t\t\t};\n\t\t\t\t}\n\n\t\t\t\t// Base-8 numbers.\n\t\t\t\tif (isOctalDigit(char)) {\n\t\t\t\t\tindex += 1;\n\t\t\t\t\tvalue += char;\n\t\t\t\t\tbad = false;\n\n\t\t\t\t\twhile (index < length) {\n\t\t\t\t\t\tchar = this.peek(index);\n\n\t\t\t\t\t\t// Numbers like '019' (note the 9) are not valid octals\n\t\t\t\t\t\t// but we still parse them and mark as malformed.\n\n\t\t\t\t\t\tif (isDecimalDigit(char)) {\n\t\t\t\t\t\t\tbad = true;\n\t\t\t\t\t\t} else if (!isOctalDigit(char)) {\n\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\t}\n\t\t\t\t\t\tvalue += char;\n\t\t\t\t\t\tindex += 1;\n\t\t\t\t\t}\n\n\t\t\t\t\tif (index < length) {\n\t\t\t\t\t\tchar = this.peek(index);\n\t\t\t\t\t\tif (isIdentifierStart(char)) {\n\t\t\t\t\t\t\treturn null;\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\n\t\t\t\t\treturn {\n\t\t\t\t\t\ttype: Token.NumericLiteral,\n\t\t\t\t\t\tvalue: value,\n\t\t\t\t\t\tbase: 8,\n\t\t\t\t\t\tisMalformed: false\n\t\t\t\t\t};\n\t\t\t\t}\n\n\t\t\t\t// Decimal numbers that start with '0' such as '09' are illegal\n\t\t\t\t// but we still parse them and return as malformed.\n\n\t\t\t\tif (isDecimalDigit(char)) {\n\t\t\t\t\tindex += 1;\n\t\t\t\t\tvalue += char;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\twhile (index < length) {\n\t\t\t\tchar = this.peek(index);\n\t\t\t\tif (!isDecimalDigit(char)) {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\tvalue += char;\n\t\t\t\tindex += 1;\n\t\t\t}\n\t\t}\n\n\t\t// Decimal digits.\n\n\t\tif (char === \".\") {\n\t\t\tvalue += char;\n\t\t\tindex += 1;\n\n\t\t\twhile (index < length) {\n\t\t\t\tchar = this.peek(index);\n\t\t\t\tif (!isDecimalDigit(char)) {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\tvalue += char;\n\t\t\t\tindex += 1;\n\t\t\t}\n\t\t}\n\n\t\t// Exponent part.\n\n\t\tif (char === \"e\" || char === \"E\") {\n\t\t\tvalue += char;\n\t\t\tindex += 1;\n\t\t\tchar = this.peek(index);\n\n\t\t\tif (char === \"+\" || char === \"-\") {\n\t\t\t\tvalue += this.peek(index);\n\t\t\t\tindex += 1;\n\t\t\t}\n\n\t\t\tchar = this.peek(index);\n\t\t\tif (isDecimalDigit(char)) {\n\t\t\t\tvalue += char;\n\t\t\t\tindex += 1;\n\n\t\t\t\twhile (index < length) {\n\t\t\t\t\tchar = this.peek(index);\n\t\t\t\t\tif (!isDecimalDigit(char)) {\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tvalue += char;\n\t\t\t\t\tindex += 1;\n\t\t\t\t}\n\t\t\t} else {\n\t\t\t\treturn null;\n\t\t\t}\n\t\t}\n\n\t\tif (index < length) {\n\t\t\tchar = this.peek(index);\n\t\t\tif (isIdentifierStart(char)) {\n\t\t\t\treturn null;\n\t\t\t}\n\t\t}\n\n\t\treturn {\n\t\t\ttype: Token.NumericLiteral,\n\t\t\tvalue: value,\n\t\t\tbase: 10,\n\t\t\tisMalformed: !isFinite(value)\n\t\t};\n\t},\n\n\t/*\n\t * Extract a string out of the next sequence of characters and/or\n\t * lines or return 'null' if its not possible. Since strings can\n\t * span across multiple lines this method has to move the char\n\t * pointer.\n\t *\n\t * This method recognizes pseudo-multiline JavaScript strings:\n\t *\n\t *   var str = \"hello\\\n\t *   world\";\n   */\n\tscanStringLiteral: function () {\n\t\tvar quote = this.peek();\n\n\t\t// String must start with a quote.\n\t\tif (quote !== \"\\\"\" && quote !== \"'\") {\n\t\t\treturn null;\n\t\t}\n\n\t\t// In JSON strings must always use double quotes.\n\t\tif (state.jsonMode && quote !== \"\\\"\") {\n\t\t\tthis.trigger(\"warning\", {\n\t\t\t\tcode: \"W108\",\n\t\t\t\tline: this.line,\n\t\t\t\tcharacter: this.char // +1?\n\t\t\t});\n\t\t}\n\n\t\tvar value = \"\";\n\t\tvar startLine = this.line;\n\t\tvar startChar = this.char;\n\t\tvar allowNewLine = false;\n\n\t\tthis.skip();\n\n\t\twhile (this.peek() !== quote) {\n\t\t\twhile (this.peek() === \"\") { // End Of Line\n\n\t\t\t\t// If an EOL is not preceded by a backslash, show a warning\n\t\t\t\t// and proceed like it was a legit multi-line string where\n\t\t\t\t// author simply forgot to escape the newline symbol.\n\t\t\t\t//\n\t\t\t\t// Another approach is to implicitly close a string on EOL\n\t\t\t\t// but it generates too many false positives.\n\n\t\t\t\tif (!allowNewLine) {\n\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\tcode: \"W112\",\n\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\tcharacter: this.char\n\t\t\t\t\t});\n\t\t\t\t} else {\n\t\t\t\t\tallowNewLine = false;\n\n\t\t\t\t\t// Otherwise show a warning if multistr option was not set.\n\t\t\t\t\t// For JSON, show warning no matter what.\n\n\t\t\t\t\tif (!state.option.multistr) {\n\t\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\t\tcode: \"W043\",\n\t\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\t\tcharacter: this.char\n\t\t\t\t\t\t});\n\t\t\t\t\t} else if (state.jsonMode) {\n\t\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\t\tcode: \"W042\",\n\t\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\t\tcharacter: this.char\n\t\t\t\t\t\t});\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\t// If we get an EOF inside of an unclosed string, show an\n\t\t\t\t// error and implicitly close it at the EOF point.\n\n\t\t\t\tif (!this.nextLine()) {\n\t\t\t\t\tthis.trigger(\"error\", {\n\t\t\t\t\t\tcode: \"E029\",\n\t\t\t\t\t\tline: startLine,\n\t\t\t\t\t\tcharacter: startChar\n\t\t\t\t\t});\n\n\t\t\t\t\treturn {\n\t\t\t\t\t\ttype: Token.StringLiteral,\n\t\t\t\t\t\tvalue: value,\n\t\t\t\t\t\tisUnclosed: true,\n\t\t\t\t\t\tquote: quote\n\t\t\t\t\t};\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tallowNewLine = false;\n\t\t\tvar char = this.peek();\n\t\t\tvar jump = 1; // A length of a jump, after we're done\n\t\t\t              // parsing this character.\n\n\t\t\tif (char < \" \") {\n\t\t\t\t// Warn about a control character in a string.\n\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\tcode: \"W113\",\n\t\t\t\t\tline: this.line,\n\t\t\t\t\tcharacter: this.char,\n\t\t\t\t\tdata: [ \"<non-printable>\" ]\n\t\t\t\t});\n\t\t\t}\n\n\t\t\t// Special treatment for some escaped characters.\n\n\t\t\tif (char === \"\\\\\") {\n\t\t\t\tthis.skip();\n\t\t\t\tchar = this.peek();\n\n\t\t\t\tswitch (char) {\n\t\t\t\tcase \"'\":\n\t\t\t\t\tif (state.jsonMode) {\n\t\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\t\tcode: \"W114\",\n\t\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\t\tcharacter: this.char,\n\t\t\t\t\t\t\tdata: [ \"\\\\'\" ]\n\t\t\t\t\t\t});\n\t\t\t\t\t}\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"b\":\n\t\t\t\t\tchar = \"\\b\";\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"f\":\n\t\t\t\t\tchar = \"\\f\";\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"n\":\n\t\t\t\t\tchar = \"\\n\";\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"r\":\n\t\t\t\t\tchar = \"\\r\";\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"t\":\n\t\t\t\t\tchar = \"\\t\";\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"0\":\n\t\t\t\t\tchar = \"\\0\";\n\n\t\t\t\t\t// Octal literals fail in strict mode.\n\t\t\t\t\t// Check if the number is between 00 and 07.\n\t\t\t\t\tvar n = parseInt(this.peek(), 10);\n\t\t\t\t\tif (n >= 0 && n <= 7 && state.directive[\"use strict\"]) {\n\t\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\t\tcode: \"W115\",\n\t\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\t\tcharacter: this.char\n\t\t\t\t\t\t});\n\t\t\t\t\t}\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"u\":\n\t\t\t\t\tchar = String.fromCharCode(parseInt(this.input.substr(1, 4), 16));\n\t\t\t\t\tjump = 5;\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"v\":\n\t\t\t\t\tif (state.jsonMode) {\n\t\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\t\tcode: \"W114\",\n\t\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\t\tcharacter: this.char,\n\t\t\t\t\t\t\tdata: [ \"\\\\v\" ]\n\t\t\t\t\t\t});\n\t\t\t\t\t}\n\n\t\t\t\t\tchar = \"\\v\";\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"x\":\n\t\t\t\t\tvar\tx = parseInt(this.input.substr(1, 2), 16);\n\n\t\t\t\t\tif (state.jsonMode) {\n\t\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\t\tcode: \"W114\",\n\t\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\t\tcharacter: this.char,\n\t\t\t\t\t\t\tdata: [ \"\\\\x-\" ]\n\t\t\t\t\t\t});\n\t\t\t\t\t}\n\n\t\t\t\t\tchar = String.fromCharCode(x);\n\t\t\t\t\tjump = 3;\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"\\\\\":\n\t\t\t\tcase \"\\\"\":\n\t\t\t\tcase \"/\":\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"\":\n\t\t\t\t\tallowNewLine = true;\n\t\t\t\t\tchar = \"\";\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"!\":\n\t\t\t\t\tif (value.slice(value.length - 2) === \"<\") {\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\n\t\t\t\t\t/*falls through */\n\t\t\t\tdefault:\n\t\t\t\t\t// Weird escaping.\n\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\tcode: \"W044\",\n\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\tcharacter: this.char\n\t\t\t\t\t});\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tvalue += char;\n\t\t\tthis.skip(jump);\n\t\t}\n\n\t\tthis.skip();\n\t\treturn {\n\t\t\ttype: Token.StringLiteral,\n\t\t\tvalue: value,\n\t\t\tisUnclosed: false,\n\t\t\tquote: quote\n\t\t};\n\t},\n\n\t/*\n\t * Extract a regular expression out of the next sequence of\n\t * characters and/or lines or return 'null' if its not possible.\n\t *\n\t * This method is platform dependent: it accepts almost any\n\t * regular expression values but then tries to compile and run\n\t * them using system's RegExp object. This means that there are\n\t * rare edge cases where one JavaScript engine complains about\n\t * your regular expression while others don't.\n\t */\n\tscanRegExp: function () {\n\t\tvar index = 0;\n\t\tvar length = this.input.length;\n\t\tvar char = this.peek();\n\t\tvar value = char;\n\t\tvar body = \"\";\n\t\tvar flags = [];\n\t\tvar malformed = false;\n\t\tvar isCharSet = false;\n\t\tvar terminated;\n\n\t\tvar scanUnexpectedChars = function () {\n\t\t\t// Unexpected control character\n\t\t\tif (char < \" \") {\n\t\t\t\tmalformed = true;\n\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\tcode: \"W048\",\n\t\t\t\t\tline: this.line,\n\t\t\t\t\tcharacter: this.char\n\t\t\t\t});\n\t\t\t}\n\n\t\t\t// Unexpected escaped character\n\t\t\tif (char === \"<\") {\n\t\t\t\tmalformed = true;\n\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\tcode: \"W049\",\n\t\t\t\t\tline: this.line,\n\t\t\t\t\tcharacter: this.char,\n\t\t\t\t\tdata: [ char ]\n\t\t\t\t});\n\t\t\t}\n\t\t}.bind(this);\n\n\t\t// Regular expressions must start with '/'\n\t\tif (!this.prereg || char !== \"/\") {\n\t\t\treturn null;\n\t\t}\n\n\t\tindex += 1;\n\t\tterminated = false;\n\n\t\t// Try to get everything in between slashes. A couple of\n\t\t// cases aside (see scanUnexpectedChars) we don't really\n\t\t// care whether the resulting expression is valid or not.\n\t\t// We will check that later using the RegExp object.\n\n\t\twhile (index < length) {\n\t\t\tchar = this.peek(index);\n\t\t\tvalue += char;\n\t\t\tbody += char;\n\n\t\t\tif (isCharSet) {\n\t\t\t\tif (char === \"]\") {\n\t\t\t\t\tif (this.peek(index - 1) !== \"\\\\\" || this.peek(index - 2) === \"\\\\\") {\n\t\t\t\t\t\tisCharSet = false;\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\tif (char === \"\\\\\") {\n\t\t\t\t\tindex += 1;\n\t\t\t\t\tchar = this.peek(index);\n\t\t\t\t\tbody += char;\n\t\t\t\t\tvalue += char;\n\n\t\t\t\t\tscanUnexpectedChars();\n\t\t\t\t}\n\n\t\t\t\tindex += 1;\n\t\t\t\tcontinue;\n\t\t\t}\n\n\t\t\tif (char === \"\\\\\") {\n\t\t\t\tindex += 1;\n\t\t\t\tchar = this.peek(index);\n\t\t\t\tbody += char;\n\t\t\t\tvalue += char;\n\n\t\t\t\tscanUnexpectedChars();\n\n\t\t\t\tif (char === \"/\") {\n\t\t\t\t\tindex += 1;\n\t\t\t\t\tcontinue;\n\t\t\t\t}\n\n\t\t\t\tif (char === \"[\") {\n\t\t\t\t\tindex += 1;\n\t\t\t\t\tcontinue;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tif (char === \"[\") {\n\t\t\t\tisCharSet = true;\n\t\t\t\tindex += 1;\n\t\t\t\tcontinue;\n\t\t\t}\n\n\t\t\tif (char === \"/\") {\n\t\t\t\tbody = body.substr(0, body.length - 1);\n\t\t\t\tterminated = true;\n\t\t\t\tindex += 1;\n\t\t\t\tbreak;\n\t\t\t}\n\n\t\t\tindex += 1;\n\t\t}\n\n\t\t// A regular expression that was never closed is an\n\t\t// error from which we cannot recover.\n\n\t\tif (!terminated) {\n\t\t\tthis.trigger(\"error\", {\n\t\t\t\tcode: \"E015\",\n\t\t\t\tline: this.line,\n\t\t\t\tcharacter: this.from\n\t\t\t});\n\n\t\t\treturn void this.trigger(\"fatal\", {\n\t\t\t\tline: this.line,\n\t\t\t\tfrom: this.from\n\t\t\t});\n\t\t}\n\n\t\t// Parse flags (if any).\n\n\t\twhile (index < length) {\n\t\t\tchar = this.peek(index);\n\t\t\tif (!/[gim]/.test(char)) {\n\t\t\t\tbreak;\n\t\t\t}\n\t\t\tflags.push(char);\n\t\t\tvalue += char;\n\t\t\tindex += 1;\n\t\t}\n\n\t\t// Check regular expression for correctness.\n\n\t\ttry {\n\t\t\tnew RegExp(body, flags.join(\"\"));\n\t\t} catch (err) {\n\t\t\tmalformed = true;\n\t\t\tthis.trigger(\"error\", {\n\t\t\t\tcode: \"E016\",\n\t\t\t\tline: this.line,\n\t\t\t\tcharacter: this.char,\n\t\t\t\tdata: [ err.message ] // Platform dependent!\n\t\t\t});\n\t\t}\n\n\t\treturn {\n\t\t\ttype: Token.RegExp,\n\t\t\tvalue: value,\n\t\t\tflags: flags,\n\t\t\tisMalformed: malformed\n\t\t};\n\t},\n\n\t/*\n\t * Scan for any occurence of mixed tabs and spaces. If smarttabs option\n\t * is on, ignore tabs followed by spaces.\n\t *\n\t * Tabs followed by one space followed by a block comment are allowed.\n\t */\n\tscanMixedSpacesAndTabs: function () {\n\t\tvar at, match;\n\n\t\tif (state.option.smarttabs) {\n\t\t\t// Negative look-behind for \"//\"\n\t\t\tmatch = this.input.match(/(\\/\\/)? \\t/);\n\t\t\tat = match && !match[1] ? 0 : -1;\n\t\t} else {\n\t\t\tat = this.input.search(/ \\t|\\t [^\\*]/);\n\t\t}\n\n\t\treturn at;\n\t},\n\n\t/*\n\t * Scan for characters that get silently deleted by one or more browsers.\n\t */\n\tscanUnsafeChars: function () {\n\t\treturn this.input.search(reg.unsafeChars);\n\t},\n\n\t/*\n\t * Produce the next raw token or return 'null' if no tokens can be matched.\n\t * This method skips over all space characters.\n\t */\n\tnext: function () {\n\t\tthis.from = this.char;\n\n\t\t// Move to the next non-space character.\n\t\tvar start;\n\t\tif (/\\s/.test(this.peek())) {\n\t\t\tstart = this.char;\n\n\t\t\twhile (/\\s/.test(this.peek())) {\n\t\t\t\tthis.from += 1;\n\t\t\t\tthis.skip();\n\t\t\t}\n\n\t\t\tif (this.peek() === \"\") { // EOL\n\t\t\t\tif (state.option.trailing) {\n\t\t\t\t\tthis.trigger(\"warning\", { code: \"W102\", line: this.line, character: start });\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\n\t\t// Methods that work with multi-line structures and move the\n\t\t// character pointer.\n\n\t\tvar match = this.scanComments() ||\n\t\t\tthis.scanStringLiteral();\n\n\t\tif (match) {\n\t\t\treturn match;\n\t\t}\n\n\t\t// Methods that don't move the character pointer.\n\n\t\tmatch =\n\t\t\tthis.scanRegExp() ||\n\t\t\tthis.scanPunctuator() ||\n\t\t\tthis.scanKeyword() ||\n\t\t\tthis.scanIdentifier() ||\n\t\t\tthis.scanNumericLiteral();\n\n\t\tif (match) {\n\t\t\tthis.skip(match.value.length);\n\t\t\treturn match;\n\t\t}\n\n\t\t// No token could be matched, give up.\n\n\t\treturn null;\n\t},\n\n\t/*\n\t * Switch to the next line and reset all char pointers. Once\n\t * switched, this method also checks for mixed spaces and tabs\n\t * and other minor warnings.\n\t */\n\tnextLine: function () {\n\t\tvar char;\n\n\t\tif (this.line >= this.lines.length) {\n\t\t\treturn false;\n\t\t}\n\n\t\tthis.input = this.lines[this.line];\n\t\tthis.line += 1;\n\t\tthis.char = 1;\n\t\tthis.from = 1;\n\n\t\tchar = this.scanMixedSpacesAndTabs();\n\t\tif (char >= 0) {\n\t\t\tthis.trigger(\"warning\", { code: \"W099\", line: this.line, character: char + 1 });\n\t\t}\n\n\t\tthis.input = this.input.replace(/\\t/g, state.tab);\n\t\tchar = this.scanUnsafeChars();\n\n\t\tif (char >= 0) {\n\t\t\tthis.trigger(\"warning\", { code: \"W100\", line: this.line, character: char });\n\t\t}\n\n\t\t// If there is a limit on line length, warn when lines get too\n\t\t// long.\n\n\t\tif (state.option.maxlen && state.option.maxlen < this.input.length) {\n\t\t\tthis.trigger(\"warning\", { code: \"W101\", line: this.line, character: this.input.length });\n\t\t}\n\n\t\treturn true;\n\t},\n\n\t/*\n\t * This is simply a synonym for nextLine() method with a friendlier\n\t * public name.\n\t */\n\tstart: function () {\n\t\tthis.nextLine();\n\t},\n\n\t/*\n\t * Produce the next token. This function is called by advance() to get\n\t * the next token. It retuns a token in a JSLint-compatible format.\n\t */\n\ttoken: function () {\n\t\tvar token;\n\n\t\t// Produce a token object.\n\t\tvar create = function (type, value, isProperty) {\n\t\t\t/*jshint validthis:true */\n\t\t\tvar obj;\n\n\t\t\tif (type !== \"(endline)\" && type !== \"(end)\") {\n\t\t\t\tthis.prereg = false;\n\t\t\t}\n\n\t\t\tif (type === \"(punctuator)\") {\n\t\t\t\tswitch (value) {\n\t\t\t\tcase \".\":\n\t\t\t\tcase \")\":\n\t\t\t\tcase \"~\":\n\t\t\t\tcase \"#\":\n\t\t\t\tcase \"]\":\n\t\t\t\t\tthis.prereg = false;\n\t\t\t\t\tbreak;\n\t\t\t\tdefault:\n\t\t\t\t\tthis.prereg = true;\n\t\t\t\t}\n\n\t\t\t\tobj = Object.create(state.syntax[value] || state.syntax[\"(error)\"]);\n\t\t\t}\n\n\t\t\tif (type === \"(identifier)\") {\n\t\t\t\tif (value === \"return\" || value === \"case\" || value === \"typeof\") {\n\t\t\t\t\tthis.prereg = true;\n\t\t\t\t}\n\n\t\t\t\tif (_.has(state.syntax, value)) {\n\t\t\t\t\tobj = Object.create(state.syntax[value] || state.syntax[\"(error)\"]);\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tif (!obj) {\n\t\t\t\tobj = Object.create(state.syntax[type]);\n\t\t\t}\n\n\t\t\tobj.identifier = (type === \"(identifier)\");\n\t\t\tobj.type = obj.type || type;\n\t\t\tobj.value = value;\n\t\t\tobj.line = this.line;\n\t\t\tobj.character = this.char;\n\t\t\tobj.from = this.from;\n\n\t\t\tif (isProperty && obj.identifier) {\n\t\t\t\tobj.isProperty = isProperty;\n\t\t\t}\n\n\t\t\treturn obj;\n\t\t}.bind(this);\n\n\t\tfor (;;) {\n\t\t\tif (!this.input.length) {\n\t\t\t\treturn create(this.nextLine() ? \"(endline)\" : \"(end)\", \"\");\n\t\t\t}\n\n\t\t\ttoken = this.next();\n\n\t\t\tif (!token) {\n\t\t\t\tif (this.input.length) {\n\t\t\t\t\t// Unexpected character.\n\t\t\t\t\tthis.trigger(\"error\", {\n\t\t\t\t\t\tcode: \"E024\",\n\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\tcharacter: this.char,\n\t\t\t\t\t\tdata: [ this.peek() ]\n\t\t\t\t\t});\n\n\t\t\t\t\tthis.input = \"\";\n\t\t\t\t}\n\n\t\t\t\tcontinue;\n\t\t\t}\n\n\t\t\tswitch (token.type) {\n\t\t\tcase Token.StringLiteral:\n\t\t\t\tthis.trigger(\"String\", {\n\t\t\t\t\tline: this.line,\n\t\t\t\t\tchar: this.char,\n\t\t\t\t\tfrom: this.from,\n\t\t\t\t\tvalue: token.value,\n\t\t\t\t\tquote: token.quote\n\t\t\t\t});\n\n\t\t\t\treturn create(\"(string)\", token.value);\n\t\t\tcase Token.Identifier:\n\t\t\t\tthis.trigger(\"Identifier\", {\n\t\t\t\t\tline: this.line,\n\t\t\t\t\tchar: this.char,\n\t\t\t\t\tfrom: this.form,\n\t\t\t\t\tname: token.value,\n\t\t\t\t\tisProperty: state.tokens.curr.id === \".\"\n\t\t\t\t});\n\n\t\t\t\t/* falls through */\n\t\t\tcase Token.Keyword:\n\t\t\tcase Token.NullLiteral:\n\t\t\tcase Token.BooleanLiteral:\n\t\t\t\treturn create(\"(identifier)\", token.value, state.tokens.curr.id === \".\");\n\n\t\t\tcase Token.NumericLiteral:\n\t\t\t\tif (token.isMalformed) {\n\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\tcode: \"W045\",\n\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\tcharacter: this.char,\n\t\t\t\t\t\tdata: [ token.value ]\n\t\t\t\t\t});\n\t\t\t\t}\n\n\t\t\t\tif (state.jsonMode && token.base === 16) {\n\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\tcode: \"W114\",\n\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\tcharacter: this.char,\n\t\t\t\t\t\tdata: [ \"0x-\" ]\n\t\t\t\t\t});\n\t\t\t\t}\n\n\t\t\t\tif (state.directive[\"use strict\"] && token.base === 8) {\n\t\t\t\t\tthis.trigger(\"warning\", {\n\t\t\t\t\t\tcode: \"W115\",\n\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\tcharacter: this.char\n\t\t\t\t\t});\n\t\t\t\t}\n\n\t\t\t\tthis.trigger(\"Number\", {\n\t\t\t\t\tline: this.line,\n\t\t\t\t\tchar: this.char,\n\t\t\t\t\tfrom: this.from,\n\t\t\t\t\tvalue: token.value,\n\t\t\t\t\tbase: token.base,\n\t\t\t\t\tisMalformed: token.malformed\n\t\t\t\t});\n\n\t\t\t\treturn create(\"(number)\", token.value);\n\n\t\t\tcase Token.RegExp:\n\t\t\t\treturn create(\"(regexp)\", token.value);\n\n\t\t\tcase Token.Comment:\n\t\t\t\tstate.tokens.curr.comment = true;\n\n\t\t\t\tif (token.isSpecial) {\n\t\t\t\t\treturn {\n\t\t\t\t\t\tvalue: token.value,\n\t\t\t\t\t\tbody: token.body,\n\t\t\t\t\t\ttype: token.commentType,\n\t\t\t\t\t\tisSpecial: token.isSpecial,\n\t\t\t\t\t\tline: this.line,\n\t\t\t\t\t\tcharacter: this.char,\n\t\t\t\t\t\tfrom: this.from\n\t\t\t\t\t};\n\t\t\t\t}\n\n\t\t\t\tbreak;\n\n\t\t\tcase \"\":\n\t\t\t\tbreak;\n\n\t\t\tdefault:\n\t\t\t\treturn create(\"(punctuator)\", token.value);\n\t\t\t}\n\t\t}\n\t}\n};\n\nexports.Lexer = Lexer;\n//@ sourceURL=/src/stable/lex.js"
));

require.define("/src/stable/reg.js",Function(['require','module','exports','__dirname','__filename','process','global'],"/*\n * Regular expressions. Some of these are stupidly long.\n */\n\n/*jshint maxlen:1000 */\n\n\"use string\";\n\n// Unsafe comment or string (ax)\nexports.unsafeString =\n\t/@cc|<\\/?|script|\\]\\s*\\]|<\\s*!|&lt/i;\n\n// Unsafe characters that are silently deleted by one or more browsers (cx)\nexports.unsafeChars =\n\t/[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u0600-\\u0604\\u070f\\u17b4\\u17b5\\u200c-\\u200f\\u2028-\\u202f\\u2060-\\u206f\\ufeff\\ufff0-\\uffff]/;\n\n// Characters in strings that need escaping (nx and nxg)\nexports.needEsc =\n\t/[\\u0000-\\u001f&<\"\\/\\\\\\u007f-\\u009f\\u00ad\\u0600-\\u0604\\u070f\\u17b4\\u17b5\\u200c-\\u200f\\u2028-\\u202f\\u2060-\\u206f\\ufeff\\ufff0-\\uffff]/;\n\nexports.needEscGlobal =\n\t/[\\u0000-\\u001f&<\"\\/\\\\\\u007f-\\u009f\\u00ad\\u0600-\\u0604\\u070f\\u17b4\\u17b5\\u200c-\\u200f\\u2028-\\u202f\\u2060-\\u206f\\ufeff\\ufff0-\\uffff]/g;\n\n// Star slash (lx)\nexports.starSlash = /\\*\\//;\n\n// Identifier (ix)\nexports.identifier = /^([a-zA-Z_$][a-zA-Z0-9_$]*)$/;\n\n// JavaScript URL (jx)\nexports.javascriptURL = /^(?:javascript|jscript|ecmascript|vbscript|mocha|livescript)\\s*:/i;\n\n// Catches /* falls through */ comments (ft)\nexports.fallsThrough = /^\\s*\\/\\*\\s*falls\\sthrough\\s*\\*\\/\\s*$/;\n//@ sourceURL=/src/stable/reg.js"
));

require.define("/src/stable/state.js",Function(['require','module','exports','__dirname','__filename','process','global'],"\"use strict\";\n\nvar state = {\n\tsyntax: {},\n\n\treset: function () {\n\t\tthis.tokens = {\n\t\t\tprev: null,\n\t\t\tnext: null,\n\t\t\tcurr: null\n\t\t},\n\n\t\tthis.option = {};\n\t\tthis.directive = {};\n\t\tthis.jsonMode = false;\n\t\tthis.lines = [];\n\t\tthis.tab = \"\";\n\t\tthis.cache = {}; // Node.JS doesn't have Map. Sniff.\n\t}\n};\n\nexports.state = state;\n//@ sourceURL=/src/stable/state.js"
));

require.define("/src/stable/style.js",Function(['require','module','exports','__dirname','__filename','process','global'],"\"use strict\";\n\nexports.register = function (linter) {\n\t// Check for properties named __proto__. This special property was\n\t// deprecated and then re-introduced for ES6.\n\n\tlinter.on(\"Identifier\", function style_scanProto(data) {\n\t\tif (linter.getOption(\"proto\")) {\n\t\t\treturn;\n\t\t}\n\n\t\tif (data.name === \"__proto__\") {\n\t\t\tlinter.warn(\"W103\", {\n\t\t\t\tline: data.line,\n\t\t\t\tchar: data.char,\n\t\t\t\tdata: [ data.name ]\n\t\t\t});\n\t\t}\n\t});\n\n\t// Check for properties named __iterator__. This is a special property\n\t// available only in browsers with JavaScript 1.7 implementation.\n\n\tlinter.on(\"Identifier\", function style_scanIterator(data) {\n\t\tif (linter.getOption(\"iterator\")) {\n\t\t\treturn;\n\t\t}\n\n\t\tif (data.name === \"__iterator__\") {\n\t\t\tlinter.warn(\"W104\", {\n\t\t\t\tline: data.line,\n\t\t\t\tchar: data.char,\n\t\t\t\tdata: [ data.name ]\n\t\t\t});\n\t\t}\n\t});\n\n\t// Check for dangling underscores.\n\n\tlinter.on(\"Identifier\", function style_scanDangling(data) {\n\t\tif (!linter.getOption(\"nomen\")) {\n\t\t\treturn;\n\t\t}\n\n\t\t// Underscore.js\n\t\tif (data.name === \"_\") {\n\t\t\treturn;\n\t\t}\n\n\t\t// In Node, __dirname and __filename should be ignored.\n\t\tif (linter.getOption(\"node\")) {\n\t\t\tif (/^(__dirname|__filename)$/.test(data.name) && !data.isProperty) {\n\t\t\t\treturn;\n\t\t\t}\n\t\t}\n\n\t\tif (/^(_+.*|.*_+)$/.test(data.name)) {\n\t\t\tlinter.warn(\"W105\", {\n\t\t\t\tline: data.line,\n\t\t\t\tchar: data.from,\n\t\t\t\tdata: [ \"dangling '_'\", data.name ]\n\t\t\t});\n\t\t}\n\t});\n\n\t// Check that all identifiers are using camelCase notation.\n\t// Exceptions: names like MY_VAR and _myVar.\n\n\tlinter.on(\"Identifier\", function style_scanCamelCase(data) {\n\t\tif (!linter.getOption(\"camelcase\")) {\n\t\t\treturn;\n\t\t}\n\n\t\tif (data.name.replace(/^_+/, \"\").indexOf(\"_\") > -1 && !data.name.match(/^[A-Z0-9_]*$/)) {\n\t\t\tlinter.warn(\"W106\", {\n\t\t\t\tline: data.line,\n\t\t\t\tchar: data.from,\n\t\t\t\tdata: [ data.name ]\n\t\t\t});\n\t\t}\n\t});\n\n\t// Enforce consistency in style of quoting.\n\n\tlinter.on(\"String\", function style_scanQuotes(data) {\n\t\tvar quotmark = linter.getOption(\"quotmark\");\n\t\tvar code;\n\n\t\tif (!quotmark) {\n\t\t\treturn;\n\t\t}\n\n\t\t// If quotmark is set to 'single' warn about all double-quotes.\n\n\t\tif (quotmark === \"single\" && data.quote !== \"'\") {\n\t\t\tcode = \"W109\";\n\t\t}\n\n\t\t// If quotmark is set to 'double' warn about all single-quotes.\n\n\t\tif (quotmark === \"double\" && data.quote !== \"\\\"\") {\n\t\t\tcode = \"W108\";\n\t\t}\n\n\t\t// If quotmark is set to true, remember the first quotation style\n\t\t// and then warn about all others.\n\n\t\tif (quotmark === true) {\n\t\t\tif (!linter.getCache(\"quotmark\")) {\n\t\t\t\tlinter.setCache(\"quotmark\", data.quote);\n\t\t\t}\n\n\t\t\tif (linter.getCache(\"quotmark\") !== data.quote) {\n\t\t\t\tcode = \"W110\";\n\t\t\t}\n\t\t}\n\n\t\tif (code) {\n\t\t\tlinter.warn(code, {\n\t\t\t\tline: data.line,\n\t\t\t\tchar: data.char,\n\t\t\t});\n\t\t}\n\t});\n\n\tlinter.on(\"Number\", function style_scanNumbers(data) {\n\t\tif (data.value.charAt(0) === \".\") {\n\t\t\t// Warn about a leading decimal point.\n\t\t\tlinter.warn(\"W008\", {\n\t\t\t\tline: data.line,\n\t\t\t\tchar: data.char,\n\t\t\t\tdata: [ data.value ]\n\t\t\t});\n\t\t}\n\n\t\tif (data.value.substr(data.value.length - 1) === \".\") {\n\t\t\t// Warn about a trailing decimal point.\n\t\t\tlinter.warn(\"W047\", {\n\t\t\t\tline: data.line,\n\t\t\t\tchar: data.char,\n\t\t\t\tdata: [ data.value ]\n\t\t\t});\n\t\t}\n\n\t\tif (/^00+/.test(data.value)) {\n\t\t\t// Multiple leading zeroes.\n\t\t\tlinter.warn(\"W046\", {\n\t\t\t\tline: data.line,\n\t\t\t\tchar: data.char,\n\t\t\t\tdata: [ data.value ]\n\t\t\t});\n\t\t}\n\t});\n\n\t// Warn about script URLs.\n\n\tlinter.on(\"String\", function style_scanJavaScriptURLs(data) {\n\t\tvar re = /^(?:javascript|jscript|ecmascript|vbscript|mocha|livescript)\\s*:/i;\n\n\t\tif (linter.getOption(\"scripturl\")) {\n\t\t\treturn;\n\t\t}\n\n\t\tif (re.test(data.value)) {\n\t\t\tlinter.warn(\"W107\", {\n\t\t\t\tline: data.line,\n\t\t\t\tchar: data.char\n\t\t\t});\n\t\t}\n\t});\n};\n//@ sourceURL=/src/stable/style.js"
));

require.define("/src/stable/jshint.js",Function(['require','module','exports','__dirname','__filename','process','global'],"/*!\n * JSHint, by JSHint Community.\n *\n * This file (and this file only) is licensed under the same slightly modified\n * MIT license that JSLint is. It stops evil-doers everywhere:\n *\n *\t Copyright (c) 2002 Douglas Crockford  (www.JSLint.com)\n *\n *\t Permission is hereby granted, free of charge, to any person obtaining\n *\t a copy of this software and associated documentation files (the \"Software\"),\n *\t to deal in the Software without restriction, including without limitation\n *\t the rights to use, copy, modify, merge, publish, distribute, sublicense,\n *\t and/or sell copies of the Software, and to permit persons to whom\n *\t the Software is furnished to do so, subject to the following conditions:\n *\n *\t The above copyright notice and this permission notice shall be included\n *\t in all copies or substantial portions of the Software.\n *\n *\t The Software shall be used for Good, not Evil.\n *\n *\t THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n *\t IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n *\t FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n *\t AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n *\t LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\n *\t FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER\n *\t DEALINGS IN THE SOFTWARE.\n *\n */\n\n/*jshint quotmark:double */\n\nvar _        = require(\"underscore\");\nvar events   = require(\"events\");\nvar vars     = require(\"../shared/vars.js\");\nvar messages = require(\"../shared/messages.js\");\nvar Lexer    = require(\"./lex.js\").Lexer;\nvar reg      = require(\"./reg.js\");\nvar state    = require(\"./state.js\").state;\nvar style    = require(\"./style.js\");\n\n// We build the application inside a function so that we produce only a single\n// global variable. That function will be invoked immediately, and its return\n// value is the JSHINT function itself.\n\nvar JSHINT = (function () {\n\t\"use strict\";\n\n\tvar anonname,\t\t// The guessed name for anonymous functions.\n\n// These are operators that should not be used with the ! operator.\n\n\t\tbang = {\n\t\t\t\"<\"  : true,\n\t\t\t\"<=\" : true,\n\t\t\t\"==\" : true,\n\t\t\t\"===\": true,\n\t\t\t\"!==\": true,\n\t\t\t\"!=\" : true,\n\t\t\t\">\"  : true,\n\t\t\t\">=\" : true,\n\t\t\t\"+\"  : true,\n\t\t\t\"-\"  : true,\n\t\t\t\"*\"  : true,\n\t\t\t\"/\"  : true,\n\t\t\t\"%\"  : true\n\t\t},\n\n\t\t// These are the JSHint boolean options.\n\t\tboolOptions = {\n\t\t\tasi         : true, // if automatic semicolon insertion should be tolerated\n\t\t\tbitwise     : true, // if bitwise operators should not be allowed\n\t\t\tboss        : true, // if advanced usage of assignments should be allowed\n\t\t\tbrowser     : true, // if the standard browser globals should be predefined\n\t\t\tcamelcase   : true, // if identifiers should be required in camel case\n\t\t\tcouch       : true, // if CouchDB globals should be predefined\n\t\t\tcurly       : true, // if curly braces around all blocks should be required\n\t\t\tdebug       : true, // if debugger statements should be allowed\n\t\t\tdevel       : true, // if logging globals should be predefined (console, alert, etc.)\n\t\t\tdojo        : true, // if Dojo Toolkit globals should be predefined\n\t\t\teqeqeq      : true, // if === should be required\n\t\t\teqnull      : true, // if == null comparisons should be tolerated\n\t\t\tes5         : true, // if ES5 syntax should be allowed\n\t\t\tesnext      : true, // if es.next specific syntax should be allowed\n\t\t\tevil        : true, // if eval should be allowed\n\t\t\texpr        : true, // if ExpressionStatement should be allowed as Programs\n\t\t\tforin       : true, // if for in statements must filter\n\t\t\tfuncscope   : true, // if only function scope should be used for scope tests\n\t\t\tglobalstrict: true, // if global \"use strict\"; should be allowed (also enables 'strict')\n\t\t\timmed       : true, // if immediate invocations must be wrapped in parens\n\t\t\titerator    : true, // if the `__iterator__` property should be allowed\n\t\t\tjquery      : true, // if jQuery globals should be predefined\n\t\t\tlastsemic   : true, // if semicolons may be ommitted for the trailing\n\t\t\t                    // statements inside of a one-line blocks.\n\t\t\tlatedef     : true, // if the use before definition should not be tolerated\n\t\t\tlaxbreak    : true, // if line breaks should not be checked\n\t\t\tlaxcomma    : true, // if line breaks should not be checked around commas\n\t\t\tloopfunc    : true, // if functions should be allowed to be defined within\n\t\t\t                    // loops\n\t\t\tmootools    : true, // if MooTools globals should be predefined\n\t\t\tmultistr    : true, // allow multiline strings\n\t\t\tnewcap      : true, // if constructor names must be capitalized\n\t\t\tnoarg       : true, // if arguments.caller and arguments.callee should be\n\t\t\t                    // disallowed\n\t\t\tnode        : true, // if the Node.js environment globals should be\n\t\t\t                    // predefined\n\t\t\tnoempty     : true, // if empty blocks should be disallowed\n\t\t\tnonew       : true, // if using `new` for side-effects should be disallowed\n\t\t\tnonstandard : true, // if non-standard (but widely adopted) globals should\n\t\t\t                    // be predefined\n\t\t\tnomen       : true, // if names should be checked\n\t\t\tonevar      : true, // if only one var statement per function should be\n\t\t\t                    // allowed\n\t\t\tpassfail    : true, // if the scan should stop on first error\n\t\t\tplusplus    : true, // if increment/decrement should not be allowed\n\t\t\tproto       : true, // if the `__proto__` property should be allowed\n\t\t\tprototypejs : true, // if Prototype and Scriptaculous globals should be\n\t\t\t                    // predefined\n\t\t\trhino       : true, // if the Rhino environment globals should be predefined\n\t\t\tundef       : true, // if variables should be declared before used\n\t\t\tunused      : true, // if variables should be always used\n\t\t\tscripturl   : true, // if script-targeted URLs should be tolerated\n\t\t\tshadow      : true, // if variable shadowing should be tolerated\n\t\t\tsmarttabs   : true, // if smarttabs should be tolerated\n\t\t\t                    // (http://www.emacswiki.org/emacs/SmartTabs)\n\t\t\tstrict      : true, // require the \"use strict\"; pragma\n\t\t\tsub         : true, // if all forms of subscript notation are tolerated\n\t\t\tsupernew    : true, // if `new function () { ... };` and `new Object;`\n\t\t\t                    // should be tolerated\n\t\t\ttrailing    : true, // if trailing whitespace rules apply\n\t\t\tvalidthis   : true, // if 'this' inside a non-constructor function is valid.\n\t\t\t                    // This is a function scoped option only.\n\t\t\twithstmt    : true, // if with statements should be allowed\n\t\t\twhite       : true, // if strict whitespace rules apply\n\t\t\tworker      : true, // if Web Worker script symbols should be allowed\n\t\t\twsh         : true, // if the Windows Scripting Host environment globals\n\t\t\t                    // should be predefined\n\t\t\tyui         : true, // YUI variables should be predefined\n\n\t\t\t// Obsolete options\n\t\t\tonecase     : true, // if one case switch statements should be allowed\n\t\t\tregexp      : true, // if the . should not be allowed in regexp literals\n\t\t\tregexdash   : true  // if unescaped first/last dash (-) inside brackets\n\t\t\t                    // should be tolerated\n\t\t},\n\n\t\t// These are the JSHint options that can take any value\n\t\t// (we use this object to detect invalid options)\n\t\tvalOptions = {\n\t\t\tmaxlen       : false,\n\t\t\tindent       : false,\n\t\t\tmaxerr       : false,\n\t\t\tpredef       : false,\n\t\t\tquotmark     : false, //'single'|'double'|true\n\t\t\tscope        : false,\n\t\t\tmaxstatements: false, // {int} max statements per function\n\t\t\tmaxdepth     : false, // {int} max nested block depth per function\n\t\t\tmaxparams    : false, // {int} max params per function\n\t\t\tmaxcomplexity: false  // {int} max cyclomatic complexity per function\n\t\t},\n\n\t\t// These are JSHint boolean options which are shared with JSLint\n\t\t// where the definition in JSHint is opposite JSLint\n\t\tinvertedOptions = {\n\t\t\tbitwise : true,\n\t\t\tforin   : true,\n\t\t\tnewcap  : true,\n\t\t\tnomen   : true,\n\t\t\tplusplus: true,\n\t\t\tregexp  : true,\n\t\t\tundef   : true,\n\t\t\twhite   : true,\n\n\t\t\t// Inverted and renamed, use JSHint name here\n\t\t\teqeqeq  : true,\n\t\t\tonevar  : true\n\t\t},\n\n\t\t// These are JSHint boolean options which are shared with JSLint\n\t\t// where the name has been changed but the effect is unchanged\n\t\trenamedOptions = {\n\t\t\teqeq   : \"eqeqeq\",\n\t\t\tvars   : \"onevar\",\n\t\t\twindows: \"wsh\"\n\t\t},\n\n\t\tdeclared, // Globals that were declared using /*global ... */ syntax.\n\t\texported, // Variables that are used outside of the current file.\n\n\t\tfunctionicity = [\n\t\t\t\"closure\", \"exception\", \"global\", \"label\",\n\t\t\t\"outer\", \"unused\", \"var\"\n\t\t],\n\n\t\tfunct, // The current function\n\t\tfunctions, // All of the functions\n\n\t\tglobal, // The global scope\n\t\tignored, // Ignored warnings\n\t\timplied, // Implied globals\n\t\tinblock,\n\t\tindent,\n\t\tlookahead,\n\t\tlex,\n\t\tmember,\n\t\tmembersOnly,\n\t\tnoreach,\n\t\tpredefined,\t\t// Global variables defined by option\n\n\t\tscope,  // The current scope\n\t\tstack,\n\t\tunuseds,\n\t\turls,\n\t\tuseESNextSyntax,\n\t\twarnings,\n\n\t\textraModules = [],\n\t\temitter = new events.EventEmitter();\n\n\tfunction checkOption(name, t) {\n\t\tname = name.trim();\n\n\t\tif (/^-W\\d{3}$/g.test(name)) {\n\t\t\treturn true;\n\t\t}\n\n\t\tif (valOptions[name] === undefined && boolOptions[name] === undefined) {\n\t\t\tif (t.type !== \"jslint\" || renamedOptions[name] === undefined) {\n\t\t\t\terror(\"E001\", t, name);\n\t\t\t\treturn false;\n\t\t\t}\n\t\t}\n\n\t\treturn true;\n\t}\n\n\tfunction isString(obj) {\n\t\treturn Object.prototype.toString.call(obj) === \"[object String]\";\n\t}\n\n\tfunction isIdentifier(tkn, value) {\n\t\tif (!tkn)\n\t\t\treturn false;\n\n\t\tif (!tkn.identifier || tkn.value !== value)\n\t\t\treturn false;\n\n\t\treturn true;\n\t}\n\n\tfunction isReserved(token) {\n\t\tif (!token.reserved) {\n\t\t\treturn false;\n\t\t}\n\n\t\tif (token.meta && token.meta.isFutureReservedWord) {\n\t\t\t// ES3 FutureReservedWord in an ES5 environment.\n\t\t\tif (state.option.es5 && !token.meta.es5) {\n\t\t\t\treturn false;\n\t\t\t}\n\n\t\t\t// Some ES5 FutureReservedWord identifiers are active only\n\t\t\t// within a strict mode environment.\n\t\t\tif (token.meta.strictOnly) {\n\t\t\t\tif (!state.option.strict && !state.directive[\"use strict\"]) {\n\t\t\t\t\treturn false;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tif (token.isProperty) {\n\t\t\t\treturn false;\n\t\t\t}\n\t\t}\n\n\t\treturn true;\n\t}\n\n\tfunction supplant(str, data) {\n\t\treturn str.replace(/\\{([^{}]*)\\}/g, function (a, b) {\n\t\t\tvar r = data[b];\n\t\t\treturn typeof r === \"string\" || typeof r === \"number\" ? r : a;\n\t\t});\n\t}\n\n\tfunction combine(t, o) {\n\t\tvar n;\n\t\tfor (n in o) {\n\t\t\tif (_.has(o, n) && !_.has(JSHINT.blacklist, n)) {\n\t\t\t\tt[n] = o[n];\n\t\t\t}\n\t\t}\n\t}\n\n\tfunction updatePredefined() {\n\t\tObject.keys(JSHINT.blacklist).forEach(function (key) {\n\t\t\tdelete predefined[key];\n\t\t});\n\t}\n\n\tfunction assume() {\n\t\tif (state.option.couch) {\n\t\t\tcombine(predefined, vars.couch);\n\t\t}\n\n\t\tif (state.option.rhino) {\n\t\t\tcombine(predefined, vars.rhino);\n\t\t}\n\n\t\tif (state.option.prototypejs) {\n\t\t\tcombine(predefined, vars.prototypejs);\n\t\t}\n\n\t\tif (state.option.node) {\n\t\t\tcombine(predefined, vars.node);\n\t\t}\n\n\t\tif (state.option.devel) {\n\t\t\tcombine(predefined, vars.devel);\n\t\t}\n\n\t\tif (state.option.dojo) {\n\t\t\tcombine(predefined, vars.dojo);\n\t\t}\n\n\t\tif (state.option.browser) {\n\t\t\tcombine(predefined, vars.browser);\n\t\t}\n\n\t\tif (state.option.nonstandard) {\n\t\t\tcombine(predefined, vars.nonstandard);\n\t\t}\n\n\t\tif (state.option.jquery) {\n\t\t\tcombine(predefined, vars.jquery);\n\t\t}\n\n\t\tif (state.option.mootools) {\n\t\t\tcombine(predefined, vars.mootools);\n\t\t}\n\n\t\tif (state.option.worker) {\n\t\t\tcombine(predefined, vars.worker);\n\t\t}\n\n\t\tif (state.option.wsh) {\n\t\t\tcombine(predefined, vars.wsh);\n\t\t}\n\n\t\tif (state.option.esnext) {\n\t\t\tuseESNextSyntax();\n\t\t}\n\n\t\tif (state.option.globalstrict && state.option.strict !== false) {\n\t\t\tstate.option.strict = true;\n\t\t}\n\n\t\tif (state.option.yui) {\n\t\t\tcombine(predefined, vars.yui);\n\t\t}\n\t}\n\n\n\t// Produce an error warning.\n\tfunction quit(code, line, chr) {\n\t\tvar percentage = Math.floor((line / state.lines.length) * 100);\n\t\tvar message = messages.errors[code].desc;\n\n\t\tthrow {\n\t\t\tname: \"JSHintError\",\n\t\t\tline: line,\n\t\t\tcharacter: chr,\n\t\t\tmessage: message + \" (\" + percentage + \"% scanned).\",\n\t\t\traw: message\n\t\t};\n\t}\n\n\tfunction isundef(scope, code, token, a) {\n\t\treturn JSHINT.undefs.push([scope, code, token, a]);\n\t}\n\n\tfunction warning(code, t, a, b, c, d) {\n\t\tvar ch, l, w, msg;\n\n\t\tif (/^W\\d{3}$/.test(code)) {\n\t\t\tif (ignored[code]) {\n\t\t\t\treturn;\n\t\t\t}\n\n\t\t\tmsg = messages.warnings[code];\n\t\t} else if (/E\\d{3}/.test(code)) {\n\t\t\tmsg = messages.errors[code];\n\t\t} else if (/I\\d{3}/.test(code)) {\n\t\t\tmsg = messages.info[code];\n\t\t}\n\n\t\tt = t || state.tokens.next;\n\t\tif (t.id === \"(end)\") {  // `~\n\t\t\tt = state.tokens.curr;\n\t\t}\n\n\t\tl = t.line || 0;\n\t\tch = t.from || 0;\n\n\t\tw = {\n\t\t\tid: \"(error)\",\n\t\t\traw: msg.desc,\n\t\t\tcode: msg.code,\n\t\t\tevidence: state.lines[l - 1] || \"\",\n\t\t\tline: l,\n\t\t\tcharacter: ch,\n\t\t\tscope: JSHINT.scope,\n\t\t\ta: a,\n\t\t\tb: b,\n\t\t\tc: c,\n\t\t\td: d\n\t\t};\n\n\t\tw.reason = supplant(msg.desc, w);\n\t\tJSHINT.errors.push(w);\n\n\t\tif (state.option.passfail) {\n\t\t\tquit(\"E042\", l, ch);\n\t\t}\n\n\t\twarnings += 1;\n\t\tif (warnings >= state.option.maxerr) {\n\t\t\tquit(\"E043\", l, ch);\n\t\t}\n\n\t\treturn w;\n\t}\n\n\tfunction warningAt(m, l, ch, a, b, c, d) {\n\t\treturn warning(m, {\n\t\t\tline: l,\n\t\t\tfrom: ch\n\t\t}, a, b, c, d);\n\t}\n\n\tfunction error(m, t, a, b, c, d) {\n\t\twarning(m, t, a, b, c, d);\n\t}\n\n\tfunction errorAt(m, l, ch, a, b, c, d) {\n\t\treturn error(m, {\n\t\t\tline: l,\n\t\t\tfrom: ch\n\t\t}, a, b, c, d);\n\t}\n\n\t// Tracking of \"internal\" scripts, like eval containing a static string\n\tfunction addInternalSrc(elem, src) {\n\t\tvar i;\n\t\ti = {\n\t\t\tid: \"(internal)\",\n\t\t\telem: elem,\n\t\t\tvalue: src\n\t\t};\n\t\tJSHINT.internals.push(i);\n\t\treturn i;\n\t}\n\n\tfunction addlabel(t, type, tkn) {\n\t\t// Define t in the current function in the current scope.\n\t\tif (type === \"exception\") {\n\t\t\tif (_.has(funct[\"(context)\"], t)) {\n\t\t\t\tif (funct[t] !== true && !state.option.node) {\n\t\t\t\t\twarning(\"W002\", state.tokens.next, t);\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\n\t\tif (_.has(funct, t) && !funct[\"(global)\"]) {\n\t\t\tif (funct[t] === true) {\n\t\t\t\tif (state.option.latedef)\n\t\t\t\t\twarning(\"W003\", state.tokens.next, t);\n\t\t\t} else {\n\t\t\t\tif (!state.option.shadow && type !== \"exception\") {\n\t\t\t\t\twarning(\"W004\", state.tokens.next, t);\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\n\t\tfunct[t] = type;\n\n\t\tif (tkn) {\n\t\t\tfunct[\"(tokens)\"][t] = tkn;\n\t\t}\n\n\t\tif (funct[\"(global)\"]) {\n\t\t\tglobal[t] = funct;\n\t\t\tif (_.has(implied, t)) {\n\t\t\t\tif (state.option.latedef) {\n\t\t\t\t\twarning(\"W003\", state.tokens.next, t);\n\t\t\t\t}\n\n\t\t\t\tdelete implied[t];\n\t\t\t}\n\t\t} else {\n\t\t\tscope[t] = funct;\n\t\t}\n\t}\n\n\tfunction doOption() {\n\t\tvar nt = state.tokens.next;\n\t\tvar body = nt.body.split(\",\").map(function (s) { return s.trim(); });\n\t\tvar predef = {};\n\n\t\tif (nt.type === \"globals\") {\n\t\t\tbody.forEach(function (g) {\n\t\t\t\tg = g.split(\":\");\n\t\t\t\tvar key = g[0];\n\t\t\t\tvar val = g[1];\n\n\t\t\t\tif (key.charAt(0) === \"-\") {\n\t\t\t\t\tkey = key.slice(1);\n\t\t\t\t\tval = false;\n\n\t\t\t\t\tJSHINT.blacklist[key] = key;\n\t\t\t\t\tupdatePredefined();\n\t\t\t\t} else {\n\t\t\t\t\tpredef[key] = (val === \"true\");\n\t\t\t\t}\n\t\t\t});\n\n\t\t\tcombine(predefined, predef);\n\n\t\t\tfor (var key in predef) {\n\t\t\t\tif (_.has(predef, key)) {\n\t\t\t\t\tdeclared[key] = nt;\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\n\t\tif (nt.type === \"exported\") {\n\t\t\tbody.forEach(function (e) {\n\t\t\t\texported[e] = true;\n\t\t\t});\n\t\t}\n\n\t\tif (nt.type === \"members\") {\n\t\t\tmembersOnly = membersOnly || {};\n\n\t\t\tbody.forEach(function (m) {\n\t\t\t\tvar ch1 = m.charAt(0);\n\t\t\t\tvar ch2 = m.charAt(m.length - 1);\n\n\t\t\t\tif (ch1 === ch2 && (ch1 === \"\\\"\" || ch1 === \"'\")) {\n\t\t\t\t\tm = m\n\t\t\t\t\t\t.substr(1, m.length - 2)\n\t\t\t\t\t\t.replace(\"\\\\b\", \"\\b\")\n\t\t\t\t\t\t.replace(\"\\\\t\", \"\\t\")\n\t\t\t\t\t\t.replace(\"\\\\n\", \"\\n\")\n\t\t\t\t\t\t.replace(\"\\\\v\", \"\\v\")\n\t\t\t\t\t\t.replace(\"\\\\f\", \"\\f\")\n\t\t\t\t\t\t.replace(\"\\\\r\", \"\\r\")\n\t\t\t\t\t\t.replace(\"\\\\\\\\\", \"\\\\\")\n\t\t\t\t\t\t.replace(\"\\\\\\\"\", \"\\\"\");\n\t\t\t\t}\n\n\t\t\t\tmembersOnly[m] = false;\n\t\t\t});\n\t\t}\n\n\t\tvar numvals = [\n\t\t\t\"maxstatements\",\n\t\t\t\"maxparams\",\n\t\t\t\"maxdepth\",\n\t\t\t\"maxcomplexity\",\n\t\t\t\"maxerr\",\n\t\t\t\"maxlen\",\n\t\t\t\"indent\"\n\t\t];\n\n\t\tif (nt.type === \"jshint\" || nt.type === \"jslint\") {\n\t\t\tbody.forEach(function (g) {\n\t\t\t\tg = g.split(\":\");\n\t\t\t\tvar key = (g[0] || \"\").trim();\n\t\t\t\tvar val = (g[1] || \"\").trim();\n\n\t\t\t\tif (!checkOption(key, nt)) {\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\tif (numvals.indexOf(key) >= 0) {\n\t\t\t\t\tval = +val;\n\n\t\t\t\t\tif (typeof val !== \"number\" || !isFinite(val) || val <= 0 || Math.floor(val) !== val) {\n\t\t\t\t\t\terror(\"E032\", nt, g[1].trim());\n\t\t\t\t\t\treturn;\n\t\t\t\t\t}\n\n\t\t\t\t\tif (key === \"indent\") {\n\t\t\t\t\t\tstate.option[\"(explicitIndent)\"] = true;\n\t\t\t\t\t}\n\n\t\t\t\t\tstate.option[key] = val;\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\tif (key === \"validthis\") {\n\t\t\t\t\t// `validthis` is valid only within a function scope.\n\t\t\t\t\tif (funct[\"(global)\"]) {\n\t\t\t\t\t\terror(\"E009\");\n\t\t\t\t\t} else {\n\t\t\t\t\t\tif (val === \"true\" || val === \"false\") {\n\t\t\t\t\t\t\tstate.option.validthis = (val === \"true\");\n\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\terror(\"E002\", nt);\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\tif (key === \"quotmark\") {\n\t\t\t\t\tswitch (val) {\n\t\t\t\t\tcase \"true\":\n\t\t\t\t\tcase \"false\":\n\t\t\t\t\t\tstate.option.quotmark = (val === \"true\");\n\t\t\t\t\t\tbreak;\n\t\t\t\t\tcase \"double\":\n\t\t\t\t\tcase \"single\":\n\t\t\t\t\t\tstate.option.quotmark = val;\n\t\t\t\t\t\tbreak;\n\t\t\t\t\tdefault:\n\t\t\t\t\t\terror(\"E002\", nt);\n\t\t\t\t\t}\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\tif (/^-W\\d{3}$/g.test(key)) {\n\t\t\t\t\tignored[key.slice(1)] = true;\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\tvar tn;\n\t\t\t\tif (val === \"true\" || val === \"false\") {\n\t\t\t\t\tif (nt.type === \"jslint\") {\n\t\t\t\t\t\ttn = renamedOptions[key] || key;\n\t\t\t\t\t\tstate.option[tn] = (val === \"true\");\n\n\t\t\t\t\t\tif (invertedOptions[tn] !== undefined) {\n\t\t\t\t\t\t\tstate.option[tn] = !state.option[tn];\n\t\t\t\t\t\t}\n\t\t\t\t\t} else {\n\t\t\t\t\t\tstate.option[key] = (val === \"true\");\n\t\t\t\t\t}\n\n\t\t\t\t\tif (key === \"newcap\") {\n\t\t\t\t\t\tstate.option[\"(explicitNewcap)\"] = true;\n\t\t\t\t\t}\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\terror(\"E002\", nt);\n\t\t\t});\n\n\t\t\tassume();\n\t\t}\n\t}\n\n\t// We need a peek function. If it has an argument, it peeks that much farther\n\t// ahead. It is used to distinguish\n\t//\t   for ( var i in ...\n\t// from\n\t//\t   for ( var i = ...\n\n\tfunction peek(p) {\n\t\tvar i = p || 0, j = 0, t;\n\n\t\twhile (j <= i) {\n\t\t\tt = lookahead[j];\n\t\t\tif (!t) {\n\t\t\t\tt = lookahead[j] = lex.token();\n\t\t\t}\n\t\t\tj += 1;\n\t\t}\n\t\treturn t;\n\t}\n\n\t// Produce the next token. It looks for programming errors.\n\n\tfunction advance(id, t) {\n\t\tswitch (state.tokens.curr.id) {\n\t\tcase \"(number)\":\n\t\t\tif (state.tokens.next.id === \".\") {\n\t\t\t\twarning(\"W005\", state.tokens.curr);\n\t\t\t}\n\t\t\tbreak;\n\t\tcase \"-\":\n\t\t\tif (state.tokens.next.id === \"-\" || state.tokens.next.id === \"--\") {\n\t\t\t\twarning(\"W006\");\n\t\t\t}\n\t\t\tbreak;\n\t\tcase \"+\":\n\t\t\tif (state.tokens.next.id === \"+\" || state.tokens.next.id === \"++\") {\n\t\t\t\twarning(\"W007\");\n\t\t\t}\n\t\t\tbreak;\n\t\t}\n\n\t\tif (state.tokens.curr.type === \"(string)\" || state.tokens.curr.identifier) {\n\t\t\tanonname = state.tokens.curr.value;\n\t\t}\n\n\t\tif (id && state.tokens.next.id !== id) {\n\t\t\tif (t) {\n\t\t\t\tif (state.tokens.next.id === \"(end)\") {\n\t\t\t\t\terror(\"E019\", t, t.id);\n\t\t\t\t} else {\n\t\t\t\t\terror(\"E020\", state.tokens.next, id, t.id, t.line, state.tokens.next.value);\n\t\t\t\t}\n\t\t\t} else if (state.tokens.next.type !== \"(identifier)\" || state.tokens.next.value !== id) {\n\t\t\t\twarning(\"W116\", state.tokens.next, id, state.tokens.next.value);\n\t\t\t}\n\t\t}\n\n\t\tstate.tokens.prev = state.tokens.curr;\n\t\tstate.tokens.curr = state.tokens.next;\n\t\tfor (;;) {\n\t\t\tstate.tokens.next = lookahead.shift() || lex.token();\n\n\t\t\tif (!state.tokens.next) { // No more tokens left, give up\n\t\t\t\tquit(\"E041\", state.tokens.curr.line);\n\t\t\t}\n\n\t\t\tif (state.tokens.next.id === \"(end)\" || state.tokens.next.id === \"(error)\") {\n\t\t\t\treturn;\n\t\t\t}\n\n\t\t\tif (state.tokens.next.isSpecial) {\n\t\t\t\tdoOption();\n\t\t\t} else {\n\t\t\t\tif (state.tokens.next.id !== \"(endline)\") {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n\n\n\t// This is the heart of JSHINT, the Pratt parser. In addition to parsing, it\n\t// is looking for ad hoc lint patterns. We add .fud to Pratt's model, which is\n\t// like .nud except that it is only used on the first token of a statement.\n\t// Having .fud makes it much easier to define statement-oriented languages like\n\t// JavaScript. I retained Pratt's nomenclature.\n\n\t// .nud  Null denotation\n\t// .fud  First null denotation\n\t// .led  Left denotation\n\t//  lbp  Left binding power\n\t//  rbp  Right binding power\n\n\t// They are elements of the parsing method called Top Down Operator Precedence.\n\n\tfunction expression(rbp, initial) {\n\t\tvar left, isArray = false, isObject = false;\n\n\t\tif (state.tokens.next.id === \"(end)\")\n\t\t\terror(\"E006\", state.tokens.curr);\n\n\t\tadvance();\n\n\t\tif (initial) {\n\t\t\tanonname = \"anonymous\";\n\t\t\tfunct[\"(verb)\"] = state.tokens.curr.value;\n\t\t}\n\n\t\tif (initial === true && state.tokens.curr.fud) {\n\t\t\tleft = state.tokens.curr.fud();\n\t\t} else {\n\t\t\tif (state.tokens.curr.nud) {\n\t\t\t\tleft = state.tokens.curr.nud();\n\t\t\t} else {\n\t\t\t\terror(\"E030\", state.tokens.curr, state.tokens.curr.id);\n\t\t\t}\n\n\t\t\twhile (rbp < state.tokens.next.lbp) {\n\t\t\t\tisArray = state.tokens.curr.value === \"Array\";\n\t\t\t\tisObject = state.tokens.curr.value === \"Object\";\n\n\t\t\t\t// #527, new Foo.Array(), Foo.Array(), new Foo.Object(), Foo.Object()\n\t\t\t\t// Line breaks in IfStatement heads exist to satisfy the checkJSHint\n\t\t\t\t// \"Line too long.\" error.\n\t\t\t\tif (left && (left.value || (left.first && left.first.value))) {\n\t\t\t\t\t// If the left.value is not \"new\", or the left.first.value is a \".\"\n\t\t\t\t\t// then safely assume that this is not \"new Array()\" and possibly\n\t\t\t\t\t// not \"new Object()\"...\n\t\t\t\t\tif (left.value !== \"new\" ||\n\t\t\t\t\t  (left.first && left.first.value && left.first.value === \".\")) {\n\t\t\t\t\t\tisArray = false;\n\t\t\t\t\t\t// ...In the case of Object, if the left.value and state.tokens.curr.value\n\t\t\t\t\t\t// are not equal, then safely assume that this not \"new Object()\"\n\t\t\t\t\t\tif (left.value !== state.tokens.curr.value) {\n\t\t\t\t\t\t\tisObject = false;\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\tadvance();\n\n\t\t\t\tif (isArray && state.tokens.curr.id === \"(\" && state.tokens.next.id === \")\") {\n\t\t\t\t\twarning(\"W009\", state.tokens.curr);\n\t\t\t\t}\n\n\t\t\t\tif (isObject && state.tokens.curr.id === \"(\" && state.tokens.next.id === \")\") {\n\t\t\t\t\twarning(\"W010\", state.tokens.curr);\n\t\t\t\t}\n\n\t\t\t\tif (state.tokens.curr.led) {\n\t\t\t\t\tleft = state.tokens.curr.led(left);\n\t\t\t\t} else {\n\t\t\t\t\terror(\"E033\", state.tokens.curr, state.tokens.curr.id);\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t\treturn left;\n\t}\n\n\n// Functions for conformance of style.\n\n\tfunction adjacent(left, right) {\n\t\tleft = left || state.tokens.curr;\n\t\tright = right || state.tokens.next;\n\t\tif (state.option.white) {\n\t\t\tif (left.character !== right.from && left.line === right.line) {\n\t\t\t\tleft.from += (left.character - left.from);\n\t\t\t\twarning(\"W011\", left, left.value);\n\t\t\t}\n\t\t}\n\t}\n\n\tfunction nobreak(left, right) {\n\t\tleft = left || state.tokens.curr;\n\t\tright = right || state.tokens.next;\n\t\tif (state.option.white && (left.character !== right.from || left.line !== right.line)) {\n\t\t\twarning(\"W012\", right, right.value);\n\t\t}\n\t}\n\n\tfunction nospace(left, right) {\n\t\tleft = left || state.tokens.curr;\n\t\tright = right || state.tokens.next;\n\t\tif (state.option.white && !left.comment) {\n\t\t\tif (left.line === right.line) {\n\t\t\t\tadjacent(left, right);\n\t\t\t}\n\t\t}\n\t}\n\n\tfunction nonadjacent(left, right) {\n\t\tif (state.option.white) {\n\t\t\tleft = left || state.tokens.curr;\n\t\t\tright = right || state.tokens.next;\n\n\t\t\tif (left.value === \";\" && right.value === \";\") {\n\t\t\t\treturn;\n\t\t\t}\n\n\t\t\tif (left.line === right.line && left.character === right.from) {\n\t\t\t\tleft.from += (left.character - left.from);\n\t\t\t\twarning(\"W013\", left, left.value);\n\t\t\t}\n\t\t}\n\t}\n\n\tfunction nobreaknonadjacent(left, right) {\n\t\tleft = left || state.tokens.curr;\n\t\tright = right || state.tokens.next;\n\t\tif (!state.option.laxbreak && left.line !== right.line) {\n\t\t\twarning(\"W014\", right, right.id);\n\t\t} else if (state.option.white) {\n\t\t\tleft = left || state.tokens.curr;\n\t\t\tright = right || state.tokens.next;\n\t\t\tif (left.character === right.from) {\n\t\t\t\tleft.from += (left.character - left.from);\n\t\t\t\twarning(\"W013\", left, left.value);\n\t\t\t}\n\t\t}\n\t}\n\n\tfunction indentation(bias) {\n\t\tif (!state.option.white && !state.option[\"(explicitIndent)\"]) {\n\t\t\treturn;\n\t\t}\n\n\t\tif (state.tokens.next.id === \"(end)\") {\n\t\t\treturn;\n\t\t}\n\n\t\tvar i = indent + (bias || 0);\n\t\tif (state.tokens.next.from !== i) {\n\t\t\twarning(\"W015\", state.tokens.next, state.tokens.next.value, i, state.tokens.next.from);\n\t\t}\n\t}\n\n\tfunction nolinebreak(t) {\n\t\tt = t || state.tokens.curr;\n\t\tif (t.line !== state.tokens.next.line) {\n\t\t\twarning(\"E022\", t, t.value);\n\t\t}\n\t}\n\n\n\tfunction comma(opts) {\n\t\topts = opts || {};\n\n\t\tif (state.tokens.curr.line !== state.tokens.next.line) {\n\t\t\tif (!state.option.laxcomma) {\n\t\t\t\tif (comma.first) {\n\t\t\t\t\twarning(\"I001\");\n\t\t\t\t\tcomma.first = false;\n\t\t\t\t}\n\t\t\t\twarning(\"W014\", state.tokens.curr, state.tokens.next.id);\n\t\t\t}\n\t\t} else if (!state.tokens.curr.comment &&\n\t\t\t\tstate.tokens.curr.character !== state.tokens.next.from && state.option.white) {\n\t\t\tstate.tokens.curr.from += (state.tokens.curr.character - state.tokens.curr.from);\n\t\t\twarning(\"W011\", state.tokens.curr, state.tokens.curr.value);\n\t\t}\n\n\t\tadvance(\",\");\n\n\t\t// TODO: This is a temporary solution to fight against false-positives in\n\t\t// arrays and objects with trailing commas (see GH-363). The best solution\n\t\t// would be to extract all whitespace rules out of parser.\n\n\t\tif (state.tokens.next.value !== \"]\" && state.tokens.next.value !== \"}\") {\n\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t}\n\n\t\tif (state.tokens.next.identifier) {\n\t\t\t// Keywords that cannot follow a comma operator.\n\t\t\tswitch (state.tokens.next.value) {\n\t\t\tcase \"break\":\n\t\t\tcase \"case\":\n\t\t\tcase \"catch\":\n\t\t\tcase \"continue\":\n\t\t\tcase \"default\":\n\t\t\tcase \"do\":\n\t\t\tcase \"else\":\n\t\t\tcase \"finally\":\n\t\t\tcase \"for\":\n\t\t\tcase \"if\":\n\t\t\tcase \"in\":\n\t\t\tcase \"instanceof\":\n\t\t\tcase \"return\":\n\t\t\tcase \"switch\":\n\t\t\tcase \"throw\":\n\t\t\tcase \"try\":\n\t\t\tcase \"var\":\n\t\t\tcase \"while\":\n\t\t\tcase \"with\":\n\t\t\t\terror(\"E024\", state.tokens.next, state.tokens.next.value);\n\t\t\t\treturn;\n\t\t\t}\n\t\t}\n\n\t\tif (state.tokens.next.type === \"(punctuator)\") {\n\t\t\tswitch (state.tokens.next.value) {\n\t\t\tcase \"}\":\n\t\t\tcase \"]\":\n\t\t\tcase \",\":\n\t\t\t\tif (opts.allowTrailing) {\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\t/* falls through */\n\t\t\tcase \")\":\n\t\t\t\terror(\"E024\", state.tokens.next, state.tokens.next.value);\n\t\t\t}\n\t\t}\n\t}\n\n\t// Functional constructors for making the symbols that will be inherited by\n\t// tokens.\n\n\tfunction symbol(s, p) {\n\t\tvar x = state.syntax[s];\n\t\tif (!x || typeof x !== \"object\") {\n\t\t\tstate.syntax[s] = x = {\n\t\t\t\tid: s,\n\t\t\t\tlbp: p,\n\t\t\t\tvalue: s\n\t\t\t};\n\t\t}\n\t\treturn x;\n\t}\n\n\tfunction delim(s) {\n\t\treturn symbol(s, 0);\n\t}\n\n\tfunction stmt(s, f) {\n\t\tvar x = delim(s);\n\t\tx.identifier = x.reserved = true;\n\t\tx.fud = f;\n\t\treturn x;\n\t}\n\n\tfunction blockstmt(s, f) {\n\t\tvar x = stmt(s, f);\n\t\tx.block = true;\n\t\treturn x;\n\t}\n\n\tfunction reserveName(x) {\n\t\tvar c = x.id.charAt(0);\n\t\tif ((c >= \"a\" && c <= \"z\") || (c >= \"A\" && c <= \"Z\")) {\n\t\t\tx.identifier = x.reserved = true;\n\t\t}\n\t\treturn x;\n\t}\n\n\tfunction prefix(s, f) {\n\t\tvar x = symbol(s, 150);\n\t\treserveName(x);\n\t\tx.nud = (typeof f === \"function\") ? f : function () {\n\t\t\tthis.right = expression(150);\n\t\t\tthis.arity = \"unary\";\n\t\t\tif (this.id === \"++\" || this.id === \"--\") {\n\t\t\t\tif (state.option.plusplus) {\n\t\t\t\t\twarning(\"W016\", this, this.id);\n\t\t\t\t} else if ((!this.right.identifier || isReserved(this.right)) &&\n\t\t\t\t\t\tthis.right.id !== \".\" && this.right.id !== \"[\") {\n\t\t\t\t\twarning(\"W017\", this);\n\t\t\t\t}\n\t\t\t}\n\t\t\treturn this;\n\t\t};\n\t\treturn x;\n\t}\n\n\tfunction type(s, f) {\n\t\tvar x = delim(s);\n\t\tx.type = s;\n\t\tx.nud = f;\n\t\treturn x;\n\t}\n\n\tfunction reserve(name, func) {\n\t\tvar x = type(name, func);\n\t\tx.identifier = true;\n\t\tx.reserved = true;\n\t\treturn x;\n\t}\n\n\tfunction FutureReservedWord(name, meta) {\n\t\tvar x = type(name, function () {\n\t\t\treturn this;\n\t\t});\n\n\t\tmeta = meta || {};\n\t\tmeta.isFutureReservedWord = true;\n\n\t\tx.value = name;\n\t\tx.identifier = true;\n\t\tx.reserved = true;\n\t\tx.meta = meta;\n\n\t\treturn x;\n\t}\n\n\tfunction reservevar(s, v) {\n\t\treturn reserve(s, function () {\n\t\t\tif (typeof v === \"function\") {\n\t\t\t\tv(this);\n\t\t\t}\n\t\t\treturn this;\n\t\t});\n\t}\n\n\tfunction infix(s, f, p, w) {\n\t\tvar x = symbol(s, p);\n\t\treserveName(x);\n\t\tx.led = function (left) {\n\t\t\tif (!w) {\n\t\t\t\tnobreaknonadjacent(state.tokens.prev, state.tokens.curr);\n\t\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t}\n\t\t\tif (s === \"in\" && left.id === \"!\") {\n\t\t\t\twarning(\"W018\", left, \"!\");\n\t\t\t}\n\t\t\tif (typeof f === \"function\") {\n\t\t\t\treturn f(left, this);\n\t\t\t} else {\n\t\t\t\tthis.left = left;\n\t\t\t\tthis.right = expression(p);\n\t\t\t\treturn this;\n\t\t\t}\n\t\t};\n\t\treturn x;\n\t}\n\n\tfunction relation(s, f) {\n\t\tvar x = symbol(s, 100);\n\n\t\tx.led = function (left) {\n\t\t\tnobreaknonadjacent(state.tokens.prev, state.tokens.curr);\n\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\tvar right = expression(100);\n\n\t\t\tif (isIdentifier(left, \"NaN\") || isIdentifier(right, \"NaN\")) {\n\t\t\t\twarning(\"W019\", this);\n\t\t\t} else if (f) {\n\t\t\t\tf.apply(this, [left, right]);\n\t\t\t}\n\n\t\t\tif (!left || !right) {\n\t\t\t\tquit(\"E041\", state.tokens.curr.line);\n\t\t\t}\n\n\t\t\tif (left.id === \"!\") {\n\t\t\t\twarning(\"W018\", left, \"!\");\n\t\t\t}\n\n\t\t\tif (right.id === \"!\") {\n\t\t\t\twarning(\"W018\", right, \"!\");\n\t\t\t}\n\n\t\t\tthis.left = left;\n\t\t\tthis.right = right;\n\t\t\treturn this;\n\t\t};\n\t\treturn x;\n\t}\n\n\tfunction isPoorRelation(node) {\n\t\treturn node &&\n\t\t\t  ((node.type === \"(number)\" && +node.value === 0) ||\n\t\t\t   (node.type === \"(string)\" && node.value === \"\") ||\n\t\t\t   (node.type === \"null\" && !state.option.eqnull) ||\n\t\t\t\tnode.type === \"true\" ||\n\t\t\t\tnode.type === \"false\" ||\n\t\t\t\tnode.type === \"undefined\");\n\t}\n\n\tfunction assignop(s) {\n\t\tsymbol(s, 20).exps = true;\n\n\t\treturn infix(s, function (left, that) {\n\t\t\tthat.left = left;\n\n\t\t\tif (predefined[left.value] === false &&\n\t\t\t\t\tscope[left.value][\"(global)\"] === true) {\n\t\t\t\twarning(\"W020\", left);\n\t\t\t} else if (left[\"function\"]) {\n\t\t\t\twarning(\"W021\", left, left.value);\n\t\t\t}\n\n\t\t\tif (left) {\n\t\t\t\tif (state.option.esnext && funct[left.value] === \"const\") {\n\t\t\t\t\terror(\"E013\", left, left.value);\n\t\t\t\t}\n\n\t\t\t\tif (left.id === \".\" || left.id === \"[\") {\n\t\t\t\t\tif (!left.left || left.left.value === \"arguments\") {\n\t\t\t\t\t\twarning(\"E031\", that);\n\t\t\t\t\t}\n\t\t\t\t\tthat.right = expression(19);\n\t\t\t\t\treturn that;\n\t\t\t\t} else if (left.identifier && !isReserved(left)) {\n\t\t\t\t\tif (funct[left.value] === \"exception\") {\n\t\t\t\t\t\twarning(\"W022\", left);\n\t\t\t\t\t}\n\t\t\t\t\tthat.right = expression(19);\n\t\t\t\t\treturn that;\n\t\t\t\t}\n\n\t\t\t\tif (left === state.syntax[\"function\"]) {\n\t\t\t\t\twarning(\"W023\", state.tokens.curr);\n\t\t\t\t}\n\t\t\t}\n\n\t\t\terror(\"E031\", that);\n\t\t}, 20);\n\t}\n\n\n\tfunction bitwise(s, f, p) {\n\t\tvar x = symbol(s, p);\n\t\treserveName(x);\n\t\tx.led = (typeof f === \"function\") ? f : function (left) {\n\t\t\tif (state.option.bitwise) {\n\t\t\t\twarning(\"W016\", this, this.id);\n\t\t\t}\n\t\t\tthis.left = left;\n\t\t\tthis.right = expression(p);\n\t\t\treturn this;\n\t\t};\n\t\treturn x;\n\t}\n\n\n\tfunction bitwiseassignop(s) {\n\t\tsymbol(s, 20).exps = true;\n\t\treturn infix(s, function (left, that) {\n\t\t\tif (state.option.bitwise) {\n\t\t\t\twarning(\"W016\", that, that.id);\n\t\t\t}\n\t\t\tnonadjacent(state.tokens.prev, state.tokens.curr);\n\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\tif (left) {\n\t\t\t\tif (left.id === \".\" || left.id === \"[\" ||\n\t\t\t\t\t\t(left.identifier && !isReserved(left))) {\n\t\t\t\t\texpression(19);\n\t\t\t\t\treturn that;\n\t\t\t\t}\n\t\t\t\tif (left === state.syntax[\"function\"]) {\n\t\t\t\t\twarning(\"W023\", state.tokens.curr);\n\t\t\t\t}\n\t\t\t\treturn that;\n\t\t\t}\n\t\t\terror(\"E031\", that);\n\t\t}, 20);\n\t}\n\n\n\tfunction suffix(s) {\n\t\tvar x = symbol(s, 150);\n\n\t\tx.led = function (left) {\n\t\t\tif (state.option.plusplus) {\n\t\t\t\twarning(\"W016\", this, this.id);\n\t\t\t} else if ((!left.identifier || isReserved(left)) && left.id !== \".\" && left.id !== \"[\") {\n\t\t\t\twarning(\"W017\", this);\n\t\t\t}\n\n\t\t\tthis.left = left;\n\t\t\treturn this;\n\t\t};\n\t\treturn x;\n\t}\n\n\t// fnparam means that this identifier is being defined as a function\n\t// argument (see identifier())\n\t// prop means that this identifier is that of an object property\n\n\tfunction optionalidentifier(fnparam, prop) {\n\t\tif (!state.tokens.next.identifier) {\n\t\t\treturn;\n\t\t}\n\n\t\tadvance();\n\n\t\tvar curr = state.tokens.curr;\n\t\tvar meta = curr.meta || {};\n\t\tvar val  = state.tokens.curr.value;\n\n\t\tif (!isReserved(curr)) {\n\t\t\treturn val;\n\t\t}\n\n\t\tif (prop) {\n\t\t\tif (state.option.es5 || meta.isFutureReservedWord) {\n\t\t\t\treturn val;\n\t\t\t}\n\t\t}\n\n\t\tif (fnparam && val === \"undefined\") {\n\t\t\treturn val;\n\t\t}\n\n\t\twarning(\"W024\", state.tokens.curr, state.tokens.curr.id);\n\t\treturn val;\n\t}\n\n\t// fnparam means that this identifier is being defined as a function\n\t// argument\n\t// prop means that this identifier is that of an object property\n\tfunction identifier(fnparam, prop) {\n\t\tvar i = optionalidentifier(fnparam, prop);\n\t\tif (i) {\n\t\t\treturn i;\n\t\t}\n\t\tif (state.tokens.curr.id === \"function\" && state.tokens.next.id === \"(\") {\n\t\t\twarning(\"W025\");\n\t\t} else {\n\t\t\terror(\"E030\", state.tokens.next, state.tokens.next.value);\n\t\t}\n\t}\n\n\n\tfunction reachable(s) {\n\t\tvar i = 0, t;\n\t\tif (state.tokens.next.id !== \";\" || noreach) {\n\t\t\treturn;\n\t\t}\n\t\tfor (;;) {\n\t\t\tt = peek(i);\n\t\t\tif (t.reach) {\n\t\t\t\treturn;\n\t\t\t}\n\t\t\tif (t.id !== \"(endline)\") {\n\t\t\t\tif (t.id === \"function\") {\n\t\t\t\t\tif (!state.option.latedef) {\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\n\t\t\t\t\twarning(\"W026\", t);\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\n\t\t\t\twarning(\"W027\", t, t.value, s);\n\t\t\t\tbreak;\n\t\t\t}\n\t\t\ti += 1;\n\t\t}\n\t}\n\n\n\tfunction statement(noindent) {\n\t\tvar i = indent, r, s = scope, t = state.tokens.next;\n\n\t\tif (t.id === \";\") {\n\t\t\tadvance(\";\");\n\t\t\treturn;\n\t\t}\n\n\t\t// Is this a labelled statement?\n\t\tvar res = isReserved(t);\n\n\t\t// We're being more tolerant here: if someone uses\n\t\t// a FutureReservedWord as a label, we warn but proceed\n\t\t// anyway.\n\n\t\tif (res && t.meta && t.meta.isFutureReservedWord) {\n\t\t\twarning(\"W024\", t, t.id);\n\t\t\tres = false;\n\t\t}\n\n\t\tif (t.identifier && !res && peek().id === \":\") {\n\t\t\tadvance();\n\t\t\tadvance(\":\");\n\t\t\tscope = Object.create(s);\n\t\t\taddlabel(t.value, \"label\");\n\n\t\t\tif (!state.tokens.next.labelled && state.tokens.next.value !== \"{\") {\n\t\t\t\twarning(\"W028\", state.tokens.next, t.value, state.tokens.next.value);\n\t\t\t}\n\n\t\t\tif (reg.javascriptURL.test(t.value + \":\")) {\n\t\t\t\twarning(\"W029\", t, t.value);\n\t\t\t}\n\n\t\t\tstate.tokens.next.label = t.value;\n\t\t\tt = state.tokens.next;\n\t\t}\n\n\t\t// Is it a lonely block?\n\n\t\tif (t.id === \"{\") {\n\t\t\tblock(true, true);\n\t\t\treturn;\n\t\t}\n\n\t\t// Parse the statement.\n\n\t\tif (!noindent) {\n\t\t\tindentation();\n\t\t}\n\t\tr = expression(0, true);\n\n\t\t// Look for the final semicolon.\n\n\t\tif (!t.block) {\n\t\t\tif (!state.option.expr && (!r || !r.exps)) {\n\t\t\t\twarning(\"W030\", state.tokens.curr);\n\t\t\t} else if (state.option.nonew && r.id === \"(\" && r.left.id === \"new\") {\n\t\t\t\twarning(\"W031\", t);\n\t\t\t}\n\n\t\t\tif (state.tokens.next.id === \",\") {\n\t\t\t\treturn comma();\n\t\t\t}\n\n\t\t\tif (state.tokens.next.id !== \";\") {\n\t\t\t\tif (!state.option.asi) {\n\t\t\t\t\t// If this is the last statement in a block that ends on\n\t\t\t\t\t// the same line *and* option lastsemic is on, ignore the warning.\n\t\t\t\t\t// Otherwise, complain about missing semicolon.\n\t\t\t\t\tif (!state.option.lastsemic || state.tokens.next.id !== \"}\" ||\n\t\t\t\t\t\tstate.tokens.next.line !== state.tokens.curr.line) {\n\t\t\t\t\t\twarningAt(\"W033\", state.tokens.curr.line, state.tokens.curr.character);\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t} else {\n\t\t\t\tadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\tadvance(\";\");\n\t\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t}\n\t\t}\n\n\t\t// Restore the indentation.\n\n\t\tindent = i;\n\t\tscope = s;\n\t\treturn r;\n\t}\n\n\n\tfunction statements(startLine) {\n\t\tvar a = [], p;\n\n\t\twhile (!state.tokens.next.reach && state.tokens.next.id !== \"(end)\") {\n\t\t\tif (state.tokens.next.id === \";\") {\n\t\t\t\tp = peek();\n\n\t\t\t\tif (!p || (p.id !== \"(\" && p.id !== \"[\")) {\n\t\t\t\t\twarning(\"W032\");\n\t\t\t\t}\n\n\t\t\t\tadvance(\";\");\n\t\t\t} else {\n\t\t\t\ta.push(statement(startLine === state.tokens.next.line));\n\t\t\t}\n\t\t}\n\t\treturn a;\n\t}\n\n\n\t/*\n\t * read all directives\n\t * recognizes a simple form of asi, but always\n\t * warns, if it is used\n\t */\n\tfunction directives() {\n\t\tvar i, p, pn;\n\n\t\tfor (;;) {\n\t\t\tif (state.tokens.next.id === \"(string)\") {\n\t\t\t\tp = peek(0);\n\t\t\t\tif (p.id === \"(endline)\") {\n\t\t\t\t\ti = 1;\n\t\t\t\t\tdo {\n\t\t\t\t\t\tpn = peek(i);\n\t\t\t\t\t\ti = i + 1;\n\t\t\t\t\t} while (pn.id === \"(endline)\");\n\n\t\t\t\t\tif (pn.id !== \";\") {\n\t\t\t\t\t\tif (pn.id !== \"(string)\" && pn.id !== \"(number)\" &&\n\t\t\t\t\t\t\tpn.id !== \"(regexp)\" && pn.identifier !== true &&\n\t\t\t\t\t\t\tpn.id !== \"}\") {\n\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\t}\n\t\t\t\t\t\twarning(\"W033\", state.tokens.next);\n\t\t\t\t\t} else {\n\t\t\t\t\t\tp = pn;\n\t\t\t\t\t}\n\t\t\t\t} else if (p.id === \"}\") {\n\t\t\t\t\t// Directive with no other statements, warn about missing semicolon\n\t\t\t\t\twarning(\"W033\", p);\n\t\t\t\t} else if (p.id !== \";\") {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\n\t\t\t\tindentation();\n\t\t\t\tadvance();\n\t\t\t\tif (state.directive[state.tokens.curr.value]) {\n\t\t\t\t\twarning(\"W034\", state.tokens.curr, state.tokens.curr.value);\n\t\t\t\t}\n\n\t\t\t\tif (state.tokens.curr.value === \"use strict\") {\n\t\t\t\t\tif (!state.option[\"(explicitNewcap)\"])\n\t\t\t\t\t\tstate.option.newcap = true;\n\t\t\t\t\tstate.option.undef = true;\n\t\t\t\t}\n\n\t\t\t\t// there's no directive negation, so always set to true\n\t\t\t\tstate.directive[state.tokens.curr.value] = true;\n\n\t\t\t\tif (p.id === \";\") {\n\t\t\t\t\tadvance(\";\");\n\t\t\t\t}\n\t\t\t\tcontinue;\n\t\t\t}\n\t\t\tbreak;\n\t\t}\n\t}\n\n\n\t/*\n\t * Parses a single block. A block is a sequence of statements wrapped in\n\t * braces.\n\t *\n\t * ordinary - true for everything but function bodies and try blocks.\n\t * stmt\t\t- true if block can be a single statement (e.g. in if/for/while).\n\t * isfunc\t- true if block is a function body\n\t */\n\tfunction block(ordinary, stmt, isfunc) {\n\t\tvar a,\n\t\t\tb = inblock,\n\t\t\told_indent = indent,\n\t\t\tm,\n\t\t\ts = scope,\n\t\t\tt,\n\t\t\tline,\n\t\t\td;\n\n\t\tinblock = ordinary;\n\n\t\tif (!ordinary || !state.option.funcscope)\n\t\t\tscope = Object.create(scope);\n\n\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\tt = state.tokens.next;\n\n\t\tvar metrics = funct[\"(metrics)\"];\n\t\tmetrics.nestedBlockDepth += 1;\n\t\tmetrics.verifyMaxNestedBlockDepthPerFunction();\n\n\t\tif (state.tokens.next.id === \"{\") {\n\t\t\tadvance(\"{\");\n\t\t\tline = state.tokens.curr.line;\n\t\t\tif (state.tokens.next.id !== \"}\") {\n\t\t\t\tindent += state.option.indent;\n\t\t\t\twhile (!ordinary && state.tokens.next.from > indent) {\n\t\t\t\t\tindent += state.option.indent;\n\t\t\t\t}\n\n\t\t\t\tif (isfunc) {\n\t\t\t\t\tm = {};\n\t\t\t\t\tfor (d in state.directive) {\n\t\t\t\t\t\tif (_.has(state.directive, d)) {\n\t\t\t\t\t\t\tm[d] = state.directive[d];\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t\tdirectives();\n\n\t\t\t\t\tif (state.option.strict && funct[\"(context)\"][\"(global)\"]) {\n\t\t\t\t\t\tif (!m[\"use strict\"] && !state.directive[\"use strict\"]) {\n\t\t\t\t\t\t\twarning(\"E007\");\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\ta = statements(line);\n\n\t\t\t\tmetrics.statementCount += a.length;\n\n\t\t\t\tif (isfunc) {\n\t\t\t\t\tstate.directive = m;\n\t\t\t\t}\n\n\t\t\t\tindent -= state.option.indent;\n\t\t\t\tif (line !== state.tokens.next.line) {\n\t\t\t\t\tindentation();\n\t\t\t\t}\n\t\t\t} else if (line !== state.tokens.next.line) {\n\t\t\t\tindentation();\n\t\t\t}\n\t\t\tadvance(\"}\", t);\n\t\t\tindent = old_indent;\n\t\t} else if (!ordinary) {\n\t\t\terror(\"E021\", state.tokens.next, \"{\", state.tokens.next.value);\n\t\t} else {\n\t\t\tif (!stmt || state.option.curly) {\n\t\t\t\twarning(\"W116\", state.tokens.next, \"{\", state.tokens.next.value);\n\t\t\t}\n\n\t\t\tnoreach = true;\n\t\t\tindent += state.option.indent;\n\t\t\t// test indentation only if statement is in new line\n\t\t\ta = [statement(state.tokens.next.line === state.tokens.curr.line)];\n\t\t\tindent -= state.option.indent;\n\t\t\tnoreach = false;\n\t\t}\n\t\tfunct[\"(verb)\"] = null;\n\t\tif (!ordinary || !state.option.funcscope) scope = s;\n\t\tinblock = b;\n\t\tif (ordinary && state.option.noempty && (!a || a.length === 0)) {\n\t\t\twarning(\"W035\");\n\t\t}\n\t\tmetrics.nestedBlockDepth -= 1;\n\t\treturn a;\n\t}\n\n\n\tfunction countMember(m) {\n\t\tif (membersOnly && typeof membersOnly[m] !== \"boolean\") {\n\t\t\twarning(\"W036\", state.tokens.curr, m);\n\t\t}\n\t\tif (typeof member[m] === \"number\") {\n\t\t\tmember[m] += 1;\n\t\t} else {\n\t\t\tmember[m] = 1;\n\t\t}\n\t}\n\n\n\tfunction note_implied(tkn) {\n\t\tvar name = tkn.value, line = tkn.line, a = implied[name];\n\t\tif (typeof a === \"function\") {\n\t\t\ta = false;\n\t\t}\n\n\t\tif (!a) {\n\t\t\ta = [line];\n\t\t\timplied[name] = a;\n\t\t} else if (a[a.length - 1] !== line) {\n\t\t\ta.push(line);\n\t\t}\n\t}\n\n\n\t// Build the syntax table by declaring the syntactic elements of the language.\n\n\ttype(\"(number)\", function () {\n\t\treturn this;\n\t});\n\n\ttype(\"(string)\", function () {\n\t\treturn this;\n\t});\n\n\tstate.syntax[\"(identifier)\"] = {\n\t\ttype: \"(identifier)\",\n\t\tlbp: 0,\n\t\tidentifier: true,\n\t\tnud: function () {\n\t\t\tvar v = this.value,\n\t\t\t\ts = scope[v],\n\t\t\t\tf;\n\n\t\t\tif (typeof s === \"function\") {\n\t\t\t\t// Protection against accidental inheritance.\n\t\t\t\ts = undefined;\n\t\t\t} else if (typeof s === \"boolean\") {\n\t\t\t\tf = funct;\n\t\t\t\tfunct = functions[0];\n\t\t\t\taddlabel(v, \"var\");\n\t\t\t\ts = funct;\n\t\t\t\tfunct = f;\n\t\t\t}\n\n\t\t\t// The name is in scope and defined in the current function.\n\t\t\tif (funct === s) {\n\t\t\t\t// Change 'unused' to 'var', and reject labels.\n\t\t\t\tswitch (funct[v]) {\n\t\t\t\tcase \"unused\":\n\t\t\t\t\tfunct[v] = \"var\";\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"unction\":\n\t\t\t\t\tfunct[v] = \"function\";\n\t\t\t\t\tthis[\"function\"] = true;\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"function\":\n\t\t\t\t\tthis[\"function\"] = true;\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"label\":\n\t\t\t\t\twarning(\"W037\", state.tokens.curr, v);\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t} else if (funct[\"(global)\"]) {\n\t\t\t\t// The name is not defined in the function.  If we are in the global\n\t\t\t\t// scope, then we have an undefined variable.\n\t\t\t\t//\n\t\t\t\t// Operators typeof and delete do not raise runtime errors even if\n\t\t\t\t// the base object of a reference is null so no need to display warning\n\t\t\t\t// if we're inside of typeof or delete.\n\n\t\t\t\tif (typeof predefined[v] !== \"boolean\") {\n\t\t\t\t\t// Attempting to subscript a null reference will throw an\n\t\t\t\t\t// error, even within the typeof and delete operators\n\t\t\t\t\tif (!(anonname === \"typeof\" || anonname === \"delete\") ||\n\t\t\t\t\t\t(state.tokens.next && (state.tokens.next.value === \".\" ||\n\t\t\t\t\t\t\tstate.tokens.next.value === \"[\"))) {\n\n\t\t\t\t\t\tisundef(funct, \"W117\", state.tokens.curr, v);\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\tnote_implied(state.tokens.curr);\n\t\t\t} else {\n\t\t\t\t// If the name is already defined in the current\n\t\t\t\t// function, but not as outer, then there is a scope error.\n\n\t\t\t\tswitch (funct[v]) {\n\t\t\t\tcase \"closure\":\n\t\t\t\tcase \"function\":\n\t\t\t\tcase \"var\":\n\t\t\t\tcase \"unused\":\n\t\t\t\t\twarning(\"W038\", state.tokens.curr, v);\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"label\":\n\t\t\t\t\twarning(\"W037\", state.tokens.curr, v);\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"outer\":\n\t\t\t\tcase \"global\":\n\t\t\t\t\tbreak;\n\t\t\t\tdefault:\n\t\t\t\t\t// If the name is defined in an outer function, make an outer entry,\n\t\t\t\t\t// and if it was unused, make it var.\n\t\t\t\t\tif (s === true) {\n\t\t\t\t\t\tfunct[v] = true;\n\t\t\t\t\t} else if (s === null) {\n\t\t\t\t\t\twarning(\"W039\", state.tokens.curr, v);\n\t\t\t\t\t\tnote_implied(state.tokens.curr);\n\t\t\t\t\t} else if (typeof s !== \"object\") {\n\t\t\t\t\t\t// Operators typeof and delete do not raise runtime errors even\n\t\t\t\t\t\t// if the base object of a reference is null so no need to\n\t\t\t\t\t\t//\n\t\t\t\t\t\t// display warning if we're inside of typeof or delete.\n\t\t\t\t\t\t// Attempting to subscript a null reference will throw an\n\t\t\t\t\t\t// error, even within the typeof and delete operators\n\t\t\t\t\t\tif (!(anonname === \"typeof\" || anonname === \"delete\") ||\n\t\t\t\t\t\t\t(state.tokens.next &&\n\t\t\t\t\t\t\t\t(state.tokens.next.value === \".\" || state.tokens.next.value === \"[\"))) {\n\n\t\t\t\t\t\t\tisundef(funct, \"W117\", state.tokens.curr, v);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tfunct[v] = true;\n\t\t\t\t\t\tnote_implied(state.tokens.curr);\n\t\t\t\t\t} else {\n\t\t\t\t\t\tswitch (s[v]) {\n\t\t\t\t\t\tcase \"function\":\n\t\t\t\t\t\tcase \"unction\":\n\t\t\t\t\t\t\tthis[\"function\"] = true;\n\t\t\t\t\t\t\ts[v] = \"closure\";\n\t\t\t\t\t\t\tfunct[v] = s[\"(global)\"] ? \"global\" : \"outer\";\n\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\tcase \"var\":\n\t\t\t\t\t\tcase \"unused\":\n\t\t\t\t\t\t\ts[v] = \"closure\";\n\t\t\t\t\t\t\tfunct[v] = s[\"(global)\"] ? \"global\" : \"outer\";\n\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\tcase \"closure\":\n\t\t\t\t\t\t\tfunct[v] = s[\"(global)\"] ? \"global\" : \"outer\";\n\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\tcase \"label\":\n\t\t\t\t\t\t\twarning(\"W037\", state.tokens.curr, v);\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\treturn this;\n\t\t},\n\t\tled: function () {\n\t\t\terror(\"E033\", state.tokens.next, state.tokens.next.value);\n\t\t}\n\t};\n\n\ttype(\"(regexp)\", function () {\n\t\treturn this;\n\t});\n\n\t// ECMAScript parser\n\n\tdelim(\"(endline)\");\n\tdelim(\"(begin)\");\n\tdelim(\"(end)\").reach = true;\n\tdelim(\"(error)\").reach = true;\n\tdelim(\"}\").reach = true;\n\tdelim(\")\");\n\tdelim(\"]\");\n\tdelim(\"\\\"\").reach = true;\n\tdelim(\"'\").reach = true;\n\tdelim(\";\");\n\tdelim(\":\").reach = true;\n\tdelim(\",\");\n\tdelim(\"#\");\n\n\treserve(\"else\");\n\treserve(\"case\").reach = true;\n\treserve(\"catch\");\n\treserve(\"default\").reach = true;\n\treserve(\"finally\");\n\treservevar(\"arguments\", function (x) {\n\t\tif (state.directive[\"use strict\"] && funct[\"(global)\"]) {\n\t\t\twarning(\"E008\", x);\n\t\t}\n\t});\n\treservevar(\"eval\");\n\treservevar(\"false\");\n\treservevar(\"Infinity\");\n\treservevar(\"null\");\n\treservevar(\"this\", function (x) {\n\t\tif (state.directive[\"use strict\"] && !state.option.validthis && ((funct[\"(statement)\"] &&\n\t\t\t\tfunct[\"(name)\"].charAt(0) > \"Z\") || funct[\"(global)\"])) {\n\t\t\twarning(\"W040\", x);\n\t\t}\n\t});\n\treservevar(\"true\");\n\treservevar(\"undefined\");\n\n\tassignop(\"=\", \"assign\", 20);\n\tassignop(\"+=\", \"assignadd\", 20);\n\tassignop(\"-=\", \"assignsub\", 20);\n\tassignop(\"*=\", \"assignmult\", 20);\n\tassignop(\"/=\", \"assigndiv\", 20).nud = function () {\n\t\terror(\"E014\");\n\t};\n\tassignop(\"%=\", \"assignmod\", 20);\n\n\tbitwiseassignop(\"&=\", \"assignbitand\", 20);\n\tbitwiseassignop(\"|=\", \"assignbitor\", 20);\n\tbitwiseassignop(\"^=\", \"assignbitxor\", 20);\n\tbitwiseassignop(\"<<=\", \"assignshiftleft\", 20);\n\tbitwiseassignop(\">>=\", \"assignshiftright\", 20);\n\tbitwiseassignop(\">>>=\", \"assignshiftrightunsigned\", 20);\n\tinfix(\"?\", function (left, that) {\n\t\tthat.left = left;\n\t\tthat.right = expression(10);\n\t\tadvance(\":\");\n\t\tthat[\"else\"] = expression(10);\n\t\treturn that;\n\t}, 30);\n\n\tinfix(\"||\", \"or\", 40);\n\tinfix(\"&&\", \"and\", 50);\n\tbitwise(\"|\", \"bitor\", 70);\n\tbitwise(\"^\", \"bitxor\", 80);\n\tbitwise(\"&\", \"bitand\", 90);\n\trelation(\"==\", function (left, right) {\n\t\tvar eqnull = state.option.eqnull && (left.value === \"null\" || right.value === \"null\");\n\n\t\tif (!eqnull && state.option.eqeqeq)\n\t\t\twarning(\"W116\", this, \"===\", \"==\");\n\t\telse if (isPoorRelation(left))\n\t\t\twarning(\"W041\", this, \"===\", left.value);\n\t\telse if (isPoorRelation(right))\n\t\t\twarning(\"W041\", this, \"===\", right.value);\n\n\t\treturn this;\n\t});\n\trelation(\"===\");\n\trelation(\"!=\", function (left, right) {\n\t\tvar eqnull = state.option.eqnull &&\n\t\t\t\t(left.value === \"null\" || right.value === \"null\");\n\n\t\tif (!eqnull && state.option.eqeqeq) {\n\t\t\twarning(\"W116\", this, \"!==\", \"!=\");\n\t\t} else if (isPoorRelation(left)) {\n\t\t\twarning(\"W041\", this, \"!==\", left.value);\n\t\t} else if (isPoorRelation(right)) {\n\t\t\twarning(\"W041\", this, \"!==\", right.value);\n\t\t}\n\t\treturn this;\n\t});\n\trelation(\"!==\");\n\trelation(\"<\");\n\trelation(\">\");\n\trelation(\"<=\");\n\trelation(\">=\");\n\tbitwise(\"<<\", \"shiftleft\", 120);\n\tbitwise(\">>\", \"shiftright\", 120);\n\tbitwise(\">>>\", \"shiftrightunsigned\", 120);\n\tinfix(\"in\", \"in\", 120);\n\tinfix(\"instanceof\", \"instanceof\", 120);\n\tinfix(\"+\", function (left, that) {\n\t\tvar right = expression(130);\n\t\tif (left && right && left.id === \"(string)\" && right.id === \"(string)\") {\n\t\t\tleft.value += right.value;\n\t\t\tleft.character = right.character;\n\t\t\tif (!state.option.scripturl && reg.javascriptURL.test(left.value)) {\n\t\t\t\twarning(\"W050\", left);\n\t\t\t}\n\t\t\treturn left;\n\t\t}\n\t\tthat.left = left;\n\t\tthat.right = right;\n\t\treturn that;\n\t}, 130);\n\tprefix(\"+\", \"num\");\n\tprefix(\"+++\", function () {\n\t\twarning(\"W007\");\n\t\tthis.right = expression(150);\n\t\tthis.arity = \"unary\";\n\t\treturn this;\n\t});\n\tinfix(\"+++\", function (left) {\n\t\twarning(\"W007\");\n\t\tthis.left = left;\n\t\tthis.right = expression(130);\n\t\treturn this;\n\t}, 130);\n\tinfix(\"-\", \"sub\", 130);\n\tprefix(\"-\", \"neg\");\n\tprefix(\"---\", function () {\n\t\twarning(\"W006\");\n\t\tthis.right = expression(150);\n\t\tthis.arity = \"unary\";\n\t\treturn this;\n\t});\n\tinfix(\"---\", function (left) {\n\t\twarning(\"W006\");\n\t\tthis.left = left;\n\t\tthis.right = expression(130);\n\t\treturn this;\n\t}, 130);\n\tinfix(\"*\", \"mult\", 140);\n\tinfix(\"/\", \"div\", 140);\n\tinfix(\"%\", \"mod\", 140);\n\n\tsuffix(\"++\", \"postinc\");\n\tprefix(\"++\", \"preinc\");\n\tstate.syntax[\"++\"].exps = true;\n\n\tsuffix(\"--\", \"postdec\");\n\tprefix(\"--\", \"predec\");\n\tstate.syntax[\"--\"].exps = true;\n\tprefix(\"delete\", function () {\n\t\tvar p = expression(0);\n\t\tif (!p || (p.id !== \".\" && p.id !== \"[\")) {\n\t\t\twarning(\"W051\");\n\t\t}\n\t\tthis.first = p;\n\t\treturn this;\n\t}).exps = true;\n\n\tprefix(\"~\", function () {\n\t\tif (state.option.bitwise) {\n\t\t\twarning(\"W052\", this, \"~\");\n\t\t}\n\t\texpression(150);\n\t\treturn this;\n\t});\n\n\tprefix(\"!\", function () {\n\t\tthis.right = expression(150);\n\t\tthis.arity = \"unary\";\n\n\t\tif (!this.right) { // '!' followed by nothing? Give up.\n\t\t\tquit(\"E041\", this.line || 0);\n\t\t}\n\n\t\tif (bang[this.right.id] === true) {\n\t\t\twarning(\"W018\", this, \"!\");\n\t\t}\n\t\treturn this;\n\t});\n\n\tprefix(\"typeof\", \"typeof\");\n\tprefix(\"new\", function () {\n\t\tvar c = expression(155), i;\n\t\tif (c && c.id !== \"function\") {\n\t\t\tif (c.identifier) {\n\t\t\t\tc[\"new\"] = true;\n\t\t\t\tswitch (c.value) {\n\t\t\t\tcase \"Number\":\n\t\t\t\tcase \"String\":\n\t\t\t\tcase \"Boolean\":\n\t\t\t\tcase \"Math\":\n\t\t\t\tcase \"JSON\":\n\t\t\t\t\twarning(\"W053\", state.tokens.prev, c.value);\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"Function\":\n\t\t\t\t\tif (!state.option.evil) {\n\t\t\t\t\t\twarning(\"W054\");\n\t\t\t\t\t}\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"Date\":\n\t\t\t\tcase \"RegExp\":\n\t\t\t\t\tbreak;\n\t\t\t\tdefault:\n\t\t\t\t\tif (c.id !== \"function\") {\n\t\t\t\t\t\ti = c.value.substr(0, 1);\n\t\t\t\t\t\tif (state.option.newcap && (i < \"A\" || i > \"Z\") && !_.has(global, c.value)) {\n\t\t\t\t\t\t\twarning(\"W055\", state.tokens.curr);\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t} else {\n\t\t\t\tif (c.id !== \".\" && c.id !== \"[\" && c.id !== \"(\") {\n\t\t\t\t\twarning(\"W056\", state.tokens.curr);\n\t\t\t\t}\n\t\t\t}\n\t\t} else {\n\t\t\tif (!state.option.supernew)\n\t\t\t\twarning(\"W057\", this);\n\t\t}\n\t\tadjacent(state.tokens.curr, state.tokens.next);\n\t\tif (state.tokens.next.id !== \"(\" && !state.option.supernew) {\n\t\t\twarning(\"W058\", state.tokens.curr, state.tokens.curr.value);\n\t\t}\n\t\tthis.first = c;\n\t\treturn this;\n\t});\n\tstate.syntax[\"new\"].exps = true;\n\n\tprefix(\"void\").exps = true;\n\n\tinfix(\".\", function (left, that) {\n\t\tadjacent(state.tokens.prev, state.tokens.curr);\n\t\tnobreak();\n\t\tvar m = identifier(false, true);\n\n\t\tif (typeof m === \"string\") {\n\t\t\tcountMember(m);\n\t\t}\n\n\t\tthat.left = left;\n\t\tthat.right = m;\n\n\t\tif (m && m === \"hasOwnProperty\" && state.tokens.next.value === \"=\") {\n\t\t\twarning(\"W001\");\n\t\t}\n\n\t\tif (left && left.value === \"arguments\" && (m === \"callee\" || m === \"caller\")) {\n\t\t\tif (state.option.noarg)\n\t\t\t\twarning(\"W059\", left, m);\n\t\t\telse if (state.directive[\"use strict\"])\n\t\t\t\terror(\"E008\");\n\t\t} else if (!state.option.evil && left && left.value === \"document\" &&\n\t\t\t\t(m === \"write\" || m === \"writeln\")) {\n\t\t\twarning(\"W060\", left);\n\t\t}\n\n\t\tif (!state.option.evil && (m === \"eval\" || m === \"execScript\")) {\n\t\t\twarning(\"W061\");\n\t\t}\n\n\t\treturn that;\n\t}, 160, true);\n\n\tinfix(\"(\", function (left, that) {\n\t\tif (state.tokens.prev.id !== \"}\" && state.tokens.prev.id !== \")\") {\n\t\t\tnobreak(state.tokens.prev, state.tokens.curr);\n\t\t}\n\n\t\tnospace();\n\t\tif (state.option.immed && !left.immed && left.id === \"function\") {\n\t\t\twarning(\"W062\");\n\t\t}\n\n\t\tvar n = 0;\n\t\tvar p = [];\n\n\t\tif (left) {\n\t\t\tif (left.type === \"(identifier)\") {\n\t\t\t\tif (left.value.match(/^[A-Z]([A-Z0-9_$]*[a-z][A-Za-z0-9_$]*)?$/)) {\n\t\t\t\t\tif (\"Number String Boolean Date Object\".indexOf(left.value) === -1) {\n\t\t\t\t\t\tif (left.value === \"Math\") {\n\t\t\t\t\t\t\twarning(\"W063\", left);\n\t\t\t\t\t\t} else if (state.option.newcap) {\n\t\t\t\t\t\t\twarning(\"W064\", left);\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\n\t\tif (state.tokens.next.id !== \")\") {\n\t\t\tfor (;;) {\n\t\t\t\tp[p.length] = expression(10);\n\t\t\t\tn += 1;\n\t\t\t\tif (state.tokens.next.id !== \",\") {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\tcomma();\n\t\t\t}\n\t\t}\n\n\t\tadvance(\")\");\n\t\tnospace(state.tokens.prev, state.tokens.curr);\n\n\t\tif (typeof left === \"object\") {\n\t\t\tif (left.value === \"parseInt\" && n === 1) {\n\t\t\t\twarning(\"W065\", state.tokens.curr);\n\t\t\t}\n\t\t\tif (!state.option.evil) {\n\t\t\t\tif (left.value === \"eval\" || left.value === \"Function\" ||\n\t\t\t\t\t\tleft.value === \"execScript\") {\n\t\t\t\t\twarning(\"W061\", left);\n\n\t\t\t\t\tif (p[0] && [0].id === \"(string)\") {\n\t\t\t\t\t\taddInternalSrc(left, p[0].value);\n\t\t\t\t\t}\n\t\t\t\t} else if (p[0] && p[0].id === \"(string)\" &&\n\t\t\t\t\t   (left.value === \"setTimeout\" ||\n\t\t\t\t\t\tleft.value === \"setInterval\")) {\n\t\t\t\t\twarning(\"W066\", left);\n\t\t\t\t\taddInternalSrc(left, p[0].value);\n\n\t\t\t\t// window.setTimeout/setInterval\n\t\t\t\t} else if (p[0] && p[0].id === \"(string)\" &&\n\t\t\t\t\t   left.value === \".\" &&\n\t\t\t\t\t   left.left.value === \"window\" &&\n\t\t\t\t\t   (left.right === \"setTimeout\" ||\n\t\t\t\t\t\tleft.right === \"setInterval\")) {\n\t\t\t\t\twarning(\"W066\", left);\n\t\t\t\t\taddInternalSrc(left, p[0].value);\n\t\t\t\t}\n\t\t\t}\n\t\t\tif (!left.identifier && left.id !== \".\" && left.id !== \"[\" &&\n\t\t\t\t\tleft.id !== \"(\" && left.id !== \"&&\" && left.id !== \"||\" &&\n\t\t\t\t\tleft.id !== \"?\") {\n\t\t\t\twarning(\"W067\", left);\n\t\t\t}\n\t\t}\n\n\t\tthat.left = left;\n\t\treturn that;\n\t}, 155, true).exps = true;\n\n\tprefix(\"(\", function () {\n\t\tnospace();\n\n\t\tif (state.tokens.next.id === \"function\") {\n\t\t\tstate.tokens.next.immed = true;\n\t\t}\n\n\t\tvar exprs = [];\n\n\t\tif (state.tokens.next.id !== \")\") {\n\t\t\tfor (;;) {\n\t\t\t\texprs.push(expression(0));\n\t\t\t\tif (state.tokens.next.id !== \",\") {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\tcomma();\n\t\t\t}\n\t\t}\n\n\t\tadvance(\")\", this);\n\t\tnospace(state.tokens.prev, state.tokens.curr);\n\t\tif (state.option.immed && exprs[0].id === \"function\") {\n\t\t\tif (state.tokens.next.id !== \"(\" &&\n\t\t\t  (state.tokens.next.id !== \".\" || (peek().value !== \"call\" && peek().value !== \"apply\"))) {\n\t\t\t\twarning(\"W068\", this);\n\t\t\t}\n\t\t}\n\n\t\treturn exprs[0];\n\t});\n\n\tinfix(\"[\", function (left, that) {\n\t\tnobreak(state.tokens.prev, state.tokens.curr);\n\t\tnospace();\n\t\tvar e = expression(0), s;\n\t\tif (e && e.type === \"(string)\") {\n\t\t\tif (!state.option.evil && (e.value === \"eval\" || e.value === \"execScript\")) {\n\t\t\t\twarning(\"W061\", that);\n\t\t\t}\n\n\t\t\tcountMember(e.value);\n\t\t\tif (!state.option.sub && reg.identifier.test(e.value)) {\n\t\t\t\ts = state.syntax[e.value];\n\t\t\t\tif (!s || !isReserved(s)) {\n\t\t\t\t\twarning(\"W069\", state.tokens.prev, e.value);\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t\tadvance(\"]\", that);\n\n\t\tif (e && e.value === \"hasOwnProperty\" && state.tokens.next.value === \"=\") {\n\t\t\twarning(\"W001\");\n\t\t}\n\n\t\tnospace(state.tokens.prev, state.tokens.curr);\n\t\tthat.left = left;\n\t\tthat.right = e;\n\t\treturn that;\n\t}, 160, true);\n\n\tprefix(\"[\", function () {\n\t\tvar b = state.tokens.curr.line !== state.tokens.next.line;\n\t\tthis.first = [];\n\t\tif (b) {\n\t\t\tindent += state.option.indent;\n\t\t\tif (state.tokens.next.from === indent + state.option.indent) {\n\t\t\t\tindent += state.option.indent;\n\t\t\t}\n\t\t}\n\t\twhile (state.tokens.next.id !== \"(end)\") {\n\t\t\twhile (state.tokens.next.id === \",\") {\n\t\t\t\tif (!state.option.es5)\n\t\t\t\t\twarning(\"W070\");\n\t\t\t\tadvance(\",\");\n\t\t\t}\n\t\t\tif (state.tokens.next.id === \"]\") {\n\t\t\t\tbreak;\n\t\t\t}\n\t\t\tif (b && state.tokens.curr.line !== state.tokens.next.line) {\n\t\t\t\tindentation();\n\t\t\t}\n\t\t\tthis.first.push(expression(10));\n\t\t\tif (state.tokens.next.id === \",\") {\n\t\t\t\tcomma({ allowTrailing: true });\n\t\t\t\tif (state.tokens.next.id === \"]\" && !state.option.es5) {\n\t\t\t\t\twarning(\"W070\", state.tokens.curr);\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t} else {\n\t\t\t\tbreak;\n\t\t\t}\n\t\t}\n\t\tif (b) {\n\t\t\tindent -= state.option.indent;\n\t\t\tindentation();\n\t\t}\n\t\tadvance(\"]\", this);\n\t\treturn this;\n\t}, 160);\n\n\n\tfunction property_name() {\n\t\tvar id = optionalidentifier(false, true);\n\n\t\tif (!id) {\n\t\t\tif (state.tokens.next.id === \"(string)\") {\n\t\t\t\tid = state.tokens.next.value;\n\t\t\t\tadvance();\n\t\t\t} else if (state.tokens.next.id === \"(number)\") {\n\t\t\t\tid = state.tokens.next.value.toString();\n\t\t\t\tadvance();\n\t\t\t}\n\t\t}\n\n\t\tif (id === \"hasOwnProperty\") {\n\t\t\twarning(\"W001\");\n\t\t}\n\n\t\treturn id;\n\t}\n\n\n\tfunction functionparams() {\n\t\tvar next   = state.tokens.next;\n\t\tvar params = [];\n\t\tvar ident;\n\n\t\tadvance(\"(\");\n\t\tnospace();\n\n\t\tif (state.tokens.next.id === \")\") {\n\t\t\tadvance(\")\");\n\t\t\treturn;\n\t\t}\n\n\t\tfor (;;) {\n\t\t\tident = identifier(true);\n\t\t\tparams.push(ident);\n\t\t\taddlabel(ident, \"unused\", state.tokens.curr);\n\t\t\tif (state.tokens.next.id === \",\") {\n\t\t\t\tcomma();\n\t\t\t} else {\n\t\t\t\tadvance(\")\", next);\n\t\t\t\tnospace(state.tokens.prev, state.tokens.curr);\n\t\t\t\treturn params;\n\t\t\t}\n\t\t}\n\t}\n\n\n\tfunction doFunction(name, statement) {\n\t\tvar f;\n\t\tvar oldOption = state.option;\n\t\tvar oldScope  = scope;\n\n\t\tstate.option = Object.create(state.option);\n\t\tscope  = Object.create(scope);\n\n\t\tfunct = {\n\t\t\t\"(name)\"     : name || \"\\\"\" + anonname + \"\\\"\",\n\t\t\t\"(line)\"     : state.tokens.next.line,\n\t\t\t\"(character)\": state.tokens.next.character,\n\t\t\t\"(context)\"  : funct,\n\t\t\t\"(breakage)\" : 0,\n\t\t\t\"(loopage)\"  : 0,\n\t\t\t\"(metrics)\"  : createMetrics(state.tokens.next),\n\t\t\t\"(scope)\"    : scope,\n\t\t\t\"(statement)\": statement,\n\t\t\t\"(tokens)\"   : {}\n\t\t};\n\n\t\tf = funct;\n\t\tstate.tokens.curr.funct = funct;\n\n\t\tfunctions.push(funct);\n\n\t\tif (name) {\n\t\t\taddlabel(name, \"function\");\n\t\t}\n\n\t\tfunct[\"(params)\"] = functionparams();\n\t\tfunct[\"(metrics)\"].verifyMaxParametersPerFunction(funct[\"(params)\"]);\n\n\t\tblock(false, false, true);\n\n\t\tfunct[\"(metrics)\"].verifyMaxStatementsPerFunction();\n\t\tfunct[\"(metrics)\"].verifyMaxComplexityPerFunction();\n\n\t\tif (state.option.unused === false) {\n\t\t\tfunct[\"(ignoreUnused)\"] = true;\n\t\t}\n\n\t\tscope = oldScope;\n\t\tstate.option = oldOption;\n\t\tfunct[\"(last)\"] = state.tokens.curr.line;\n\t\tfunct[\"(lastcharacter)\"] = state.tokens.curr.character;\n\t\tfunct = funct[\"(context)\"];\n\n\t\treturn f;\n\t}\n\n\tfunction createMetrics(functionStartToken) {\n\t\treturn {\n\t\t\tstatementCount: 0,\n\t\t\tnestedBlockDepth: -1,\n\t\t\tComplexityCount: 1,\n\t\t\tverifyMaxStatementsPerFunction: function () {\n\t\t\t\tif (state.option.maxstatements &&\n\t\t\t\t\tthis.statementCount > state.option.maxstatements) {\n\t\t\t\t\twarning(\"W071\", functionStartToken, this.statementCount);\n\t\t\t\t}\n\t\t\t},\n\n\t\t\tverifyMaxParametersPerFunction: function (params) {\n\t\t\t\tparams = params || [];\n\n\t\t\t\tif (state.option.maxparams && params.length > state.option.maxparams) {\n\t\t\t\t\twarning(\"W072\", functionStartToken, params.length);\n\t\t\t\t}\n\t\t\t},\n\n\t\t\tverifyMaxNestedBlockDepthPerFunction: function () {\n\t\t\t\tif (state.option.maxdepth &&\n\t\t\t\t\tthis.nestedBlockDepth > 0 &&\n\t\t\t\t\tthis.nestedBlockDepth === state.option.maxdepth + 1) {\n\t\t\t\t\twarning(\"W073\", null, this.nestedBlockDepth);\n\t\t\t\t}\n\t\t\t},\n\n\t\t\tverifyMaxComplexityPerFunction: function () {\n\t\t\t\tvar max = state.option.maxcomplexity;\n\t\t\t\tvar cc = this.ComplexityCount;\n\t\t\t\tif (max && cc > max) {\n\t\t\t\t\twarning(\"W074\", functionStartToken, cc);\n\t\t\t\t}\n\t\t\t}\n\t\t};\n\t}\n\n\tfunction increaseComplexityCount() {\n\t\tfunct[\"(metrics)\"].ComplexityCount += 1;\n\t}\n\n\t// Parse assignments that were found instead of conditionals.\n\t// For example: if (a = 1) { ... }\n\n\tfunction parseCondAssignment() {\n\t\tswitch (state.tokens.next.id) {\n\t\tcase \"=\":\n\t\tcase \"+=\":\n\t\tcase \"-=\":\n\t\tcase \"*=\":\n\t\tcase \"%=\":\n\t\tcase \"&=\":\n\t\tcase \"|=\":\n\t\tcase \"^=\":\n\t\tcase \"/=\":\n\t\t\tif (!state.option.boss) {\n\t\t\t\twarning(\"W084\");\n\t\t\t}\n\n\t\t\tadvance(state.tokens.next.id);\n\t\t\texpression(20);\n\t\t}\n\t}\n\n\n\t(function (x) {\n\t\tx.nud = function () {\n\t\t\tvar b, f, i, p, t;\n\t\t\tvar props = {}; // All properties, including accessors\n\n\t\t\tfunction saveProperty(name, tkn) {\n\t\t\t\tif (props[name] && _.has(props, name))\n\t\t\t\t\twarning(\"W075\", state.tokens.next, i);\n\t\t\t\telse\n\t\t\t\t\tprops[name] = {};\n\n\t\t\t\tprops[name].basic = true;\n\t\t\t\tprops[name].basictkn = tkn;\n\t\t\t}\n\n\t\t\tfunction saveSetter(name, tkn) {\n\t\t\t\tif (props[name] && _.has(props, name)) {\n\t\t\t\t\tif (props[name].basic || props[name].setter)\n\t\t\t\t\t\twarning(\"W075\", state.tokens.next, i);\n\t\t\t\t} else {\n\t\t\t\t\tprops[name] = {};\n\t\t\t\t}\n\n\t\t\t\tprops[name].setter = true;\n\t\t\t\tprops[name].setterToken = tkn;\n\t\t\t}\n\n\t\t\tfunction saveGetter(name) {\n\t\t\t\tif (props[name] && _.has(props, name)) {\n\t\t\t\t\tif (props[name].basic || props[name].getter)\n\t\t\t\t\t\twarning(\"W075\", state.tokens.next, i);\n\t\t\t\t} else {\n\t\t\t\t\tprops[name] = {};\n\t\t\t\t}\n\n\t\t\t\tprops[name].getter = true;\n\t\t\t\tprops[name].getterToken = state.tokens.curr;\n\t\t\t}\n\n\t\t\tb = state.tokens.curr.line !== state.tokens.next.line;\n\t\t\tif (b) {\n\t\t\t\tindent += state.option.indent;\n\t\t\t\tif (state.tokens.next.from === indent + state.option.indent) {\n\t\t\t\t\tindent += state.option.indent;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tfor (;;) {\n\t\t\t\tif (state.tokens.next.id === \"}\") {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\n\t\t\t\tif (b) {\n\t\t\t\t\tindentation();\n\t\t\t\t}\n\n\t\t\t\tif (state.tokens.next.value === \"get\" && peek().id !== \":\") {\n\t\t\t\t\tadvance(\"get\");\n\n\t\t\t\t\tif (!state.option.es5) {\n\t\t\t\t\t\terror(\"E034\");\n\t\t\t\t\t}\n\n\t\t\t\t\ti = property_name();\n\t\t\t\t\tif (!i) {\n\t\t\t\t\t\terror(\"E035\");\n\t\t\t\t\t}\n\n\t\t\t\t\tsaveGetter(i);\n\t\t\t\t\tt = state.tokens.next;\n\t\t\t\t\tadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\t\tf = doFunction();\n\t\t\t\t\tp = f[\"(params)\"];\n\n\t\t\t\t\tif (p) {\n\t\t\t\t\t\twarning(\"W076\", t, p[0], i);\n\t\t\t\t\t}\n\n\t\t\t\t\tadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\t} else if (state.tokens.next.value === \"set\" && peek().id !== \":\") {\n\t\t\t\t\tadvance(\"set\");\n\n\t\t\t\t\tif (!state.option.es5) {\n\t\t\t\t\t\terror(\"E034\");\n\t\t\t\t\t}\n\n\t\t\t\t\ti = property_name();\n\t\t\t\t\tif (!i) {\n\t\t\t\t\t\terror(\"E035\");\n\t\t\t\t\t}\n\n\t\t\t\t\tsaveSetter(i, state.tokens.next);\n\t\t\t\t\tt = state.tokens.next;\n\t\t\t\t\tadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\t\tf = doFunction();\n\t\t\t\t\tp = f[\"(params)\"];\n\n\t\t\t\t\tif (!p || p.length !== 1) {\n\t\t\t\t\t\twarning(\"W077\", t, i);\n\t\t\t\t\t}\n\t\t\t\t} else {\n\t\t\t\t\ti = property_name();\n\t\t\t\t\tsaveProperty(i, state.tokens.next);\n\n\t\t\t\t\tif (typeof i !== \"string\") {\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\n\t\t\t\t\tadvance(\":\");\n\t\t\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\t\texpression(10);\n\t\t\t\t}\n\n\t\t\t\tcountMember(i);\n\t\t\t\tif (state.tokens.next.id === \",\") {\n\t\t\t\t\tcomma({ allowTrailing: true });\n\t\t\t\t\tif (state.tokens.next.id === \",\") {\n\t\t\t\t\t\twarning(\"W070\", state.tokens.curr);\n\t\t\t\t\t} else if (state.tokens.next.id === \"}\" && !state.option.es5) {\n\t\t\t\t\t\twarning(\"W070\", state.tokens.curr);\n\t\t\t\t\t}\n\t\t\t\t} else {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t}\n\t\t\tif (b) {\n\t\t\t\tindent -= state.option.indent;\n\t\t\t\tindentation();\n\t\t\t}\n\t\t\tadvance(\"}\", this);\n\n\t\t\t// Check for lonely setters if in the ES5 mode.\n\t\t\tif (state.option.es5) {\n\t\t\t\tfor (var name in props) {\n\t\t\t\t\tif (_.has(props, name) && props[name].setter && !props[name].getter) {\n\t\t\t\t\t\twarning(\"W078\", props[name].setterToken);\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\treturn this;\n\t\t};\n\t\tx.fud = function () {\n\t\t\terror(\"E036\", state.tokens.curr);\n\t\t};\n\t}(delim(\"{\")));\n\n\t// This Function is called when esnext option is set to true\n\t// it adds the `const` statement to JSHINT\n\n\tuseESNextSyntax = function () {\n\t\tvar conststatement = stmt(\"const\", function (prefix) {\n\t\t\tvar id, name, value;\n\n\t\t\tthis.first = [];\n\t\t\tfor (;;) {\n\t\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\tid = identifier();\n\t\t\t\tif (funct[id] === \"const\") {\n\t\t\t\t\twarning(\"E011\", null, id);\n\t\t\t\t}\n\t\t\t\tif (funct[\"(global)\"] && predefined[id] === false) {\n\t\t\t\t\twarning(\"W079\", state.tokens.curr, id);\n\t\t\t\t}\n\t\t\t\taddlabel(id, \"const\");\n\t\t\t\tif (prefix) {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\tname = state.tokens.curr;\n\t\t\t\tthis.first.push(state.tokens.curr);\n\n\t\t\t\tif (state.tokens.next.id !== \"=\") {\n\t\t\t\t\twarning(\"E012\", state.tokens.curr, id);\n\t\t\t\t}\n\n\t\t\t\tif (state.tokens.next.id === \"=\") {\n\t\t\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\t\tadvance(\"=\");\n\t\t\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\t\tif (state.tokens.next.id === \"undefined\") {\n\t\t\t\t\t\twarning(\"W080\", state.tokens.curr, id);\n\t\t\t\t\t}\n\t\t\t\t\tif (peek(0).id === \"=\" && state.tokens.next.identifier) {\n\t\t\t\t\t\terror(\"E037\", state.tokens.next, state.tokens.next.value);\n\t\t\t\t\t}\n\t\t\t\t\tvalue = expression(0);\n\t\t\t\t\tname.first = value;\n\t\t\t\t}\n\n\t\t\t\tif (state.tokens.next.id !== \",\") {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\tcomma();\n\t\t\t}\n\t\t\treturn this;\n\t\t});\n\t\tconststatement.exps = true;\n\t};\n\n\tvar varstatement = stmt(\"var\", function (prefix) {\n\t\t// JavaScript does not have block scope. It only has function scope. So,\n\t\t// declaring a variable in a block can have unexpected consequences.\n\t\tvar id, name, value;\n\n\t\tif (funct[\"(onevar)\"] && state.option.onevar) {\n\t\t\twarning(\"W081\");\n\t\t} else if (!funct[\"(global)\"]) {\n\t\t\tfunct[\"(onevar)\"] = true;\n\t\t}\n\n\t\tthis.first = [];\n\n\t\tfor (;;) {\n\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\tid = identifier();\n\n\t\t\tif (state.option.esnext && funct[id] === \"const\") {\n\t\t\t\twarning(\"E011\", null, id);\n\t\t\t}\n\n\t\t\tif (funct[\"(global)\"] && predefined[id] === false) {\n\t\t\t\twarning(\"W079\", state.tokens.curr, id);\n\t\t\t}\n\n\t\t\taddlabel(id, \"unused\", state.tokens.curr);\n\n\t\t\tif (prefix) {\n\t\t\t\tbreak;\n\t\t\t}\n\n\t\t\tname = state.tokens.curr;\n\t\t\tthis.first.push(state.tokens.curr);\n\n\t\t\tif (state.tokens.next.id === \"=\") {\n\t\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\tadvance(\"=\");\n\t\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\tif (state.tokens.next.id === \"undefined\") {\n\t\t\t\t\twarning(\"W080\", state.tokens.curr, id);\n\t\t\t\t}\n\t\t\t\tif (peek(0).id === \"=\" && state.tokens.next.identifier) {\n\t\t\t\t\terror(\"E038\", state.tokens.next, state.tokens.next.value);\n\t\t\t\t}\n\t\t\t\tvalue = expression(0);\n\t\t\t\tname.first = value;\n\t\t\t}\n\t\t\tif (state.tokens.next.id !== \",\") {\n\t\t\t\tbreak;\n\t\t\t}\n\t\t\tcomma();\n\t\t}\n\t\treturn this;\n\t});\n\tvarstatement.exps = true;\n\n\tblockstmt(\"function\", function () {\n\t\tif (inblock) {\n\t\t\twarning(\"W082\", state.tokens.curr);\n\n\t\t}\n\t\tvar i = identifier();\n\t\tif (state.option.esnext && funct[i] === \"const\") {\n\t\t\twarning(\"E011\", null, i);\n\t\t}\n\t\tadjacent(state.tokens.curr, state.tokens.next);\n\t\taddlabel(i, \"unction\", state.tokens.curr);\n\n\t\tdoFunction(i, { statement: true });\n\t\tif (state.tokens.next.id === \"(\" && state.tokens.next.line === state.tokens.curr.line) {\n\t\t\terror(\"E039\");\n\t\t}\n\t\treturn this;\n\t});\n\n\tprefix(\"function\", function () {\n\t\tvar i = optionalidentifier();\n\t\tif (i) {\n\t\t\tadjacent(state.tokens.curr, state.tokens.next);\n\t\t} else {\n\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t}\n\t\tdoFunction(i);\n\t\tif (!state.option.loopfunc && funct[\"(loopage)\"]) {\n\t\t\twarning(\"W083\");\n\t\t}\n\t\treturn this;\n\t});\n\n\tblockstmt(\"if\", function () {\n\t\tvar t = state.tokens.next;\n\t\tincreaseComplexityCount();\n\t\tadvance(\"(\");\n\t\tnonadjacent(this, t);\n\t\tnospace();\n\t\texpression(20);\n\t\tparseCondAssignment();\n\t\tadvance(\")\", t);\n\t\tnospace(state.tokens.prev, state.tokens.curr);\n\t\tblock(true, true);\n\t\tif (state.tokens.next.id === \"else\") {\n\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\tadvance(\"else\");\n\t\t\tif (state.tokens.next.id === \"if\" || state.tokens.next.id === \"switch\") {\n\t\t\t\tstatement(true);\n\t\t\t} else {\n\t\t\t\tblock(true, true);\n\t\t\t}\n\t\t}\n\t\treturn this;\n\t});\n\n\tblockstmt(\"try\", function () {\n\t\tvar b;\n\n\t\tfunction doCatch() {\n\t\t\tvar oldScope = scope;\n\t\t\tvar e;\n\n\t\t\tadvance(\"catch\");\n\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\tadvance(\"(\");\n\n\t\t\tscope = Object.create(oldScope);\n\n\t\t\te = state.tokens.next.value;\n\t\t\tif (state.tokens.next.type !== \"(identifier)\") {\n\t\t\t\te = null;\n\t\t\t\twarning(\"E030\", state.tokens.next, e);\n\t\t\t}\n\n\t\t\tadvance();\n\t\t\tadvance(\")\");\n\n\t\t\tfunct = {\n\t\t\t\t\"(name)\"     : \"(catch)\",\n\t\t\t\t\"(line)\"     : state.tokens.next.line,\n\t\t\t\t\"(character)\": state.tokens.next.character,\n\t\t\t\t\"(context)\"  : funct,\n\t\t\t\t\"(breakage)\" : funct[\"(breakage)\"],\n\t\t\t\t\"(loopage)\"  : funct[\"(loopage)\"],\n\t\t\t\t\"(scope)\"    : scope,\n\t\t\t\t\"(statement)\": false,\n\t\t\t\t\"(metrics)\"  : createMetrics(state.tokens.next),\n\t\t\t\t\"(catch)\"    : true,\n\t\t\t\t\"(tokens)\"   : {}\n\t\t\t};\n\n\t\t\tif (e) {\n\t\t\t\taddlabel(e, \"exception\");\n\t\t\t}\n\n\t\t\tstate.tokens.curr.funct = funct;\n\t\t\tfunctions.push(funct);\n\n\t\t\tblock(false);\n\n\t\t\tscope = oldScope;\n\n\t\t\tfunct[\"(last)\"] = state.tokens.curr.line;\n\t\t\tfunct[\"(lastcharacter)\"] = state.tokens.curr.character;\n\t\t\tfunct = funct[\"(context)\"];\n\t\t}\n\n\t\tblock(false);\n\n\t\tif (state.tokens.next.id === \"catch\") {\n\t\t\tincreaseComplexityCount();\n\t\t\tdoCatch();\n\t\t\tb = true;\n\t\t}\n\n\t\tif (state.tokens.next.id === \"finally\") {\n\t\t\tadvance(\"finally\");\n\t\t\tblock(false);\n\t\t\treturn;\n\t\t} else if (!b) {\n\t\t\terror(\"E021\", state.tokens.next, \"catch\", state.tokens.next.value);\n\t\t}\n\n\t\treturn this;\n\t});\n\n\tblockstmt(\"while\", function () {\n\t\tvar t = state.tokens.next;\n\t\tfunct[\"(breakage)\"] += 1;\n\t\tfunct[\"(loopage)\"] += 1;\n\t\tincreaseComplexityCount();\n\t\tadvance(\"(\");\n\t\tnonadjacent(this, t);\n\t\tnospace();\n\t\texpression(20);\n\t\tparseCondAssignment();\n\t\tadvance(\")\", t);\n\t\tnospace(state.tokens.prev, state.tokens.curr);\n\t\tblock(true, true);\n\t\tfunct[\"(breakage)\"] -= 1;\n\t\tfunct[\"(loopage)\"] -= 1;\n\t\treturn this;\n\t}).labelled = true;\n\n\tblockstmt(\"with\", function () {\n\t\tvar t = state.tokens.next;\n\t\tif (state.directive[\"use strict\"]) {\n\t\t\terror(\"E010\", state.tokens.curr);\n\t\t} else if (!state.option.withstmt) {\n\t\t\twarning(\"W085\", state.tokens.curr);\n\t\t}\n\n\t\tadvance(\"(\");\n\t\tnonadjacent(this, t);\n\t\tnospace();\n\t\texpression(0);\n\t\tadvance(\")\", t);\n\t\tnospace(state.tokens.prev, state.tokens.curr);\n\t\tblock(true, true);\n\n\t\treturn this;\n\t});\n\n\tblockstmt(\"switch\", function () {\n\t\tvar t = state.tokens.next,\n\t\t\tg = false;\n\t\tfunct[\"(breakage)\"] += 1;\n\t\tadvance(\"(\");\n\t\tnonadjacent(this, t);\n\t\tnospace();\n\t\tthis.condition = expression(20);\n\t\tadvance(\")\", t);\n\t\tnospace(state.tokens.prev, state.tokens.curr);\n\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\tt = state.tokens.next;\n\t\tadvance(\"{\");\n\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\tindent += state.option.indent;\n\t\tthis.cases = [];\n\n\t\tfor (;;) {\n\t\t\tswitch (state.tokens.next.id) {\n\t\t\tcase \"case\":\n\t\t\t\tswitch (funct[\"(verb)\"]) {\n\t\t\t\tcase \"break\":\n\t\t\t\tcase \"case\":\n\t\t\t\tcase \"continue\":\n\t\t\t\tcase \"return\":\n\t\t\t\tcase \"switch\":\n\t\t\t\tcase \"throw\":\n\t\t\t\t\tbreak;\n\t\t\t\tdefault:\n\t\t\t\t\t// You can tell JSHint that you don't use break intentionally by\n\t\t\t\t\t// adding a comment /* falls through */ on a line just before\n\t\t\t\t\t// the next `case`.\n\t\t\t\t\tif (!reg.fallsThrough.test(state.lines[state.tokens.next.line - 2])) {\n\t\t\t\t\t\twarning(\"W086\", state.tokens.curr, \"case\");\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t\tindentation(-state.option.indent);\n\t\t\t\tadvance(\"case\");\n\t\t\t\tthis.cases.push(expression(20));\n\t\t\t\tincreaseComplexityCount();\n\t\t\t\tg = true;\n\t\t\t\tadvance(\":\");\n\t\t\t\tfunct[\"(verb)\"] = \"case\";\n\t\t\t\tbreak;\n\t\t\tcase \"default\":\n\t\t\t\tswitch (funct[\"(verb)\"]) {\n\t\t\t\tcase \"break\":\n\t\t\t\tcase \"continue\":\n\t\t\t\tcase \"return\":\n\t\t\t\tcase \"throw\":\n\t\t\t\t\tbreak;\n\t\t\t\tdefault:\n\t\t\t\t\t// Do not display a warning if 'default' is the first statement or if\n\t\t\t\t\t// there is a special /* falls through */ comment.\n\t\t\t\t\tif (this.cases.length) {\n\t\t\t\t\t\tif (!reg.fallsThrough.test(state.lines[state.tokens.next.line - 2])) {\n\t\t\t\t\t\t\twarning(\"W086\", state.tokens.curr, \"default\");\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t\tindentation(-state.option.indent);\n\t\t\t\tadvance(\"default\");\n\t\t\t\tg = true;\n\t\t\t\tadvance(\":\");\n\t\t\t\tbreak;\n\t\t\tcase \"}\":\n\t\t\t\tindent -= state.option.indent;\n\t\t\t\tindentation();\n\t\t\t\tadvance(\"}\", t);\n\t\t\t\tfunct[\"(breakage)\"] -= 1;\n\t\t\t\tfunct[\"(verb)\"] = undefined;\n\t\t\t\treturn;\n\t\t\tcase \"(end)\":\n\t\t\t\terror(\"E023\", state.tokens.next, \"}\");\n\t\t\t\treturn;\n\t\t\tdefault:\n\t\t\t\tif (g) {\n\t\t\t\t\tswitch (state.tokens.curr.id) {\n\t\t\t\t\tcase \",\":\n\t\t\t\t\t\terror(\"E040\");\n\t\t\t\t\t\treturn;\n\t\t\t\t\tcase \":\":\n\t\t\t\t\t\tg = false;\n\t\t\t\t\t\tstatements();\n\t\t\t\t\t\tbreak;\n\t\t\t\t\tdefault:\n\t\t\t\t\t\terror(\"E025\", state.tokens.curr);\n\t\t\t\t\t\treturn;\n\t\t\t\t\t}\n\t\t\t\t} else {\n\t\t\t\t\tif (state.tokens.curr.id === \":\") {\n\t\t\t\t\t\tadvance(\":\");\n\t\t\t\t\t\terror(\"E024\", state.tokens.curr, \":\");\n\t\t\t\t\t\tstatements();\n\t\t\t\t\t} else {\n\t\t\t\t\t\terror(\"E021\", state.tokens.next, \"case\", state.tokens.next.value);\n\t\t\t\t\t\treturn;\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}).labelled = true;\n\n\tstmt(\"debugger\", function () {\n\t\tif (!state.option.debug) {\n\t\t\twarning(\"W087\");\n\t\t}\n\t\treturn this;\n\t}).exps = true;\n\n\t(function () {\n\t\tvar x = stmt(\"do\", function () {\n\t\t\tfunct[\"(breakage)\"] += 1;\n\t\t\tfunct[\"(loopage)\"] += 1;\n\t\t\tincreaseComplexityCount();\n\n\t\t\tthis.first = block(true);\n\t\t\tadvance(\"while\");\n\t\t\tvar t = state.tokens.next;\n\t\t\tnonadjacent(state.tokens.curr, t);\n\t\t\tadvance(\"(\");\n\t\t\tnospace();\n\t\t\texpression(20);\n\t\t\tparseCondAssignment();\n\t\t\tadvance(\")\", t);\n\t\t\tnospace(state.tokens.prev, state.tokens.curr);\n\t\t\tfunct[\"(breakage)\"] -= 1;\n\t\t\tfunct[\"(loopage)\"] -= 1;\n\t\t\treturn this;\n\t\t});\n\t\tx.labelled = true;\n\t\tx.exps = true;\n\t}());\n\n\tblockstmt(\"for\", function () {\n\t\tvar s, t = state.tokens.next;\n\t\tfunct[\"(breakage)\"] += 1;\n\t\tfunct[\"(loopage)\"] += 1;\n\t\tincreaseComplexityCount();\n\t\tadvance(\"(\");\n\t\tnonadjacent(this, t);\n\t\tnospace();\n\t\tif (peek(state.tokens.next.id === \"var\" ? 1 : 0).id === \"in\") {\n\t\t\tif (state.tokens.next.id === \"var\") {\n\t\t\t\tadvance(\"var\");\n\t\t\t\tvarstatement.fud.call(varstatement, true);\n\t\t\t} else {\n\t\t\t\tswitch (funct[state.tokens.next.value]) {\n\t\t\t\tcase \"unused\":\n\t\t\t\t\tfunct[state.tokens.next.value] = \"var\";\n\t\t\t\t\tbreak;\n\t\t\t\tcase \"var\":\n\t\t\t\t\tbreak;\n\t\t\t\tdefault:\n\t\t\t\t\twarning(\"W088\", state.tokens.next, state.tokens.next.value);\n\t\t\t\t}\n\t\t\t\tadvance();\n\t\t\t}\n\t\t\tadvance(\"in\");\n\t\t\texpression(20);\n\t\t\tadvance(\")\", t);\n\t\t\ts = block(true, true);\n\t\t\tif (state.option.forin && s && (s.length > 1 || typeof s[0] !== \"object\" ||\n\t\t\t\t\ts[0].value !== \"if\")) {\n\t\t\t\twarning(\"W089\", this);\n\t\t\t}\n\t\t\tfunct[\"(breakage)\"] -= 1;\n\t\t\tfunct[\"(loopage)\"] -= 1;\n\t\t\treturn this;\n\t\t} else {\n\t\t\tif (state.tokens.next.id !== \";\") {\n\t\t\t\tif (state.tokens.next.id === \"var\") {\n\t\t\t\t\tadvance(\"var\");\n\t\t\t\t\tvarstatement.fud.call(varstatement);\n\t\t\t\t} else {\n\t\t\t\t\tfor (;;) {\n\t\t\t\t\t\texpression(0, \"for\");\n\t\t\t\t\t\tif (state.tokens.next.id !== \",\") {\n\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\t}\n\t\t\t\t\t\tcomma();\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tnolinebreak(state.tokens.curr);\n\t\t\tadvance(\";\");\n\t\t\tif (state.tokens.next.id !== \";\") {\n\t\t\t\texpression(20);\n\t\t\t\tparseCondAssignment();\n\t\t\t}\n\t\t\tnolinebreak(state.tokens.curr);\n\t\t\tadvance(\";\");\n\t\t\tif (state.tokens.next.id === \";\") {\n\t\t\t\terror(\"E021\", state.tokens.next, \")\", \";\");\n\t\t\t}\n\t\t\tif (state.tokens.next.id !== \")\") {\n\t\t\t\tfor (;;) {\n\t\t\t\t\texpression(0, \"for\");\n\t\t\t\t\tif (state.tokens.next.id !== \",\") {\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tcomma();\n\t\t\t\t}\n\t\t\t}\n\t\t\tadvance(\")\", t);\n\t\t\tnospace(state.tokens.prev, state.tokens.curr);\n\t\t\tblock(true, true);\n\t\t\tfunct[\"(breakage)\"] -= 1;\n\t\t\tfunct[\"(loopage)\"] -= 1;\n\t\t\treturn this;\n\t\t}\n\t}).labelled = true;\n\n\n\tstmt(\"break\", function () {\n\t\tvar v = state.tokens.next.value;\n\n\t\tif (funct[\"(breakage)\"] === 0)\n\t\t\twarning(\"W052\", state.tokens.next, this.value);\n\n\t\tif (!state.option.asi)\n\t\t\tnolinebreak(this);\n\n\t\tif (state.tokens.next.id !== \";\") {\n\t\t\tif (state.tokens.curr.line === state.tokens.next.line) {\n\t\t\t\tif (funct[v] !== \"label\") {\n\t\t\t\t\twarning(\"W090\", state.tokens.next, v);\n\t\t\t\t} else if (scope[v] !== funct) {\n\t\t\t\t\twarning(\"W091\", state.tokens.next, v);\n\t\t\t\t}\n\t\t\t\tthis.first = state.tokens.next;\n\t\t\t\tadvance();\n\t\t\t}\n\t\t}\n\t\treachable(\"break\");\n\t\treturn this;\n\t}).exps = true;\n\n\n\tstmt(\"continue\", function () {\n\t\tvar v = state.tokens.next.value;\n\n\t\tif (funct[\"(breakage)\"] === 0)\n\t\t\twarning(\"W052\", state.tokens.next, this.value);\n\n\t\tif (!state.option.asi)\n\t\t\tnolinebreak(this);\n\n\t\tif (state.tokens.next.id !== \";\") {\n\t\t\tif (state.tokens.curr.line === state.tokens.next.line) {\n\t\t\t\tif (funct[v] !== \"label\") {\n\t\t\t\t\twarning(\"W090\", state.tokens.next, v);\n\t\t\t\t} else if (scope[v] !== funct) {\n\t\t\t\t\twarning(\"W091\", state.tokens.next, v);\n\t\t\t\t}\n\t\t\t\tthis.first = state.tokens.next;\n\t\t\t\tadvance();\n\t\t\t}\n\t\t} else if (!funct[\"(loopage)\"]) {\n\t\t\twarning(\"W052\", state.tokens.next, this.value);\n\t\t}\n\t\treachable(\"continue\");\n\t\treturn this;\n\t}).exps = true;\n\n\n\tstmt(\"return\", function () {\n\t\tif (this.line === state.tokens.next.line) {\n\t\t\tif (state.tokens.next.id === \"(regexp)\")\n\t\t\t\twarning(\"W092\");\n\n\t\t\tif (state.tokens.next.id !== \";\" && !state.tokens.next.reach) {\n\t\t\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\t\t\tthis.first = expression(0);\n\n\t\t\t\tif (this.first.value === \"=\" && !state.option.boss) {\n\t\t\t\t\twarningAt(\"W093\", this.first.line, this.first.character);\n\t\t\t\t}\n\t\t\t}\n\t\t} else if (!state.option.asi) {\n\t\t\tnolinebreak(this); // always warn (Line breaking error)\n\t\t}\n\t\treachable(\"return\");\n\t\treturn this;\n\t}).exps = true;\n\n\n\tstmt(\"throw\", function () {\n\t\tnolinebreak(this);\n\t\tnonadjacent(state.tokens.curr, state.tokens.next);\n\t\tthis.first = expression(20);\n\t\treachable(\"throw\");\n\t\treturn this;\n\t}).exps = true;\n\n\t// Future Reserved Words\n\n\tFutureReservedWord(\"abstract\");\n\tFutureReservedWord(\"boolean\");\n\tFutureReservedWord(\"byte\");\n\tFutureReservedWord(\"char\");\n\tFutureReservedWord(\"class\", { es5: true });\n\tFutureReservedWord(\"double\");\n\tFutureReservedWord(\"enum\", { es5: true });\n\tFutureReservedWord(\"export\", { es5: true });\n\tFutureReservedWord(\"extends\", { es5: true });\n\tFutureReservedWord(\"final\");\n\tFutureReservedWord(\"float\");\n\tFutureReservedWord(\"goto\");\n\tFutureReservedWord(\"implements\", { es5: true, strictOnly: true });\n\tFutureReservedWord(\"import\", { es5: true });\n\tFutureReservedWord(\"int\");\n\tFutureReservedWord(\"interface\");\n\tFutureReservedWord(\"let\", { es5: true, strictOnly: true });\n\tFutureReservedWord(\"long\");\n\tFutureReservedWord(\"native\");\n\tFutureReservedWord(\"package\", { es5: true, strictOnly: true });\n\tFutureReservedWord(\"private\", { es5: true, strictOnly: true });\n\tFutureReservedWord(\"protected\", { es5: true, strictOnly: true });\n\tFutureReservedWord(\"public\", { es5: true, strictOnly: true });\n\tFutureReservedWord(\"short\");\n\tFutureReservedWord(\"static\", { es5: true, strictOnly: true });\n\tFutureReservedWord(\"super\", { es5: true });\n\tFutureReservedWord(\"synchronized\");\n\tFutureReservedWord(\"throws\");\n\tFutureReservedWord(\"transient\");\n\tFutureReservedWord(\"volatile\");\n\tFutureReservedWord(\"yield\", { es5: true, strictOnly: true });\n\n\t// Parse JSON\n\n\tfunction jsonValue() {\n\n\t\tfunction jsonObject() {\n\t\t\tvar o = {}, t = state.tokens.next;\n\t\t\tadvance(\"{\");\n\t\t\tif (state.tokens.next.id !== \"}\") {\n\t\t\t\tfor (;;) {\n\t\t\t\t\tif (state.tokens.next.id === \"(end)\") {\n\t\t\t\t\t\terror(\"E026\", state.tokens.next, t.line);\n\t\t\t\t\t} else if (state.tokens.next.id === \"}\") {\n\t\t\t\t\t\twarning(\"W094\", state.tokens.curr);\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t} else if (state.tokens.next.id === \",\") {\n\t\t\t\t\t\terror(\"E028\", state.tokens.next);\n\t\t\t\t\t} else if (state.tokens.next.id !== \"(string)\") {\n\t\t\t\t\t\twarning(\"W095\", state.tokens.next, state.tokens.next.value);\n\t\t\t\t\t}\n\t\t\t\t\tif (o[state.tokens.next.value] === true) {\n\t\t\t\t\t\twarning(\"W075\", state.tokens.next, state.tokens.next.value);\n\t\t\t\t\t} else if ((state.tokens.next.value === \"__proto__\" &&\n\t\t\t\t\t\t!state.option.proto) || (state.tokens.next.value === \"__iterator__\" &&\n\t\t\t\t\t\t!state.option.iterator)) {\n\t\t\t\t\t\twarning(\"W096\", state.tokens.next, state.tokens.next.value);\n\t\t\t\t\t} else {\n\t\t\t\t\t\to[state.tokens.next.value] = true;\n\t\t\t\t\t}\n\t\t\t\t\tadvance();\n\t\t\t\t\tadvance(\":\");\n\t\t\t\t\tjsonValue();\n\t\t\t\t\tif (state.tokens.next.id !== \",\") {\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tadvance(\",\");\n\t\t\t\t}\n\t\t\t}\n\t\t\tadvance(\"}\");\n\t\t}\n\n\t\tfunction jsonArray() {\n\t\t\tvar t = state.tokens.next;\n\t\t\tadvance(\"[\");\n\t\t\tif (state.tokens.next.id !== \"]\") {\n\t\t\t\tfor (;;) {\n\t\t\t\t\tif (state.tokens.next.id === \"(end)\") {\n\t\t\t\t\t\terror(\"E027\", state.tokens.next, t.line);\n\t\t\t\t\t} else if (state.tokens.next.id === \"]\") {\n\t\t\t\t\t\twarning(\"W094\", state.tokens.curr);\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t} else if (state.tokens.next.id === \",\") {\n\t\t\t\t\t\terror(\"E028\", state.tokens.next);\n\t\t\t\t\t}\n\t\t\t\t\tjsonValue();\n\t\t\t\t\tif (state.tokens.next.id !== \",\") {\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tadvance(\",\");\n\t\t\t\t}\n\t\t\t}\n\t\t\tadvance(\"]\");\n\t\t}\n\n\t\tswitch (state.tokens.next.id) {\n\t\tcase \"{\":\n\t\t\tjsonObject();\n\t\t\tbreak;\n\t\tcase \"[\":\n\t\t\tjsonArray();\n\t\t\tbreak;\n\t\tcase \"true\":\n\t\tcase \"false\":\n\t\tcase \"null\":\n\t\tcase \"(number)\":\n\t\tcase \"(string)\":\n\t\t\tadvance();\n\t\t\tbreak;\n\t\tcase \"-\":\n\t\t\tadvance(\"-\");\n\t\t\tif (state.tokens.curr.character !== state.tokens.next.from) {\n\t\t\t\twarning(\"W011\", state.tokens.curr);\n\t\t\t}\n\t\t\tadjacent(state.tokens.curr, state.tokens.next);\n\t\t\tadvance(\"(number)\");\n\t\t\tbreak;\n\t\tdefault:\n\t\t\terror(\"E003\", state.tokens.next);\n\t\t}\n\t}\n\n\n\t// The actual JSHINT function itself.\n\tvar itself = function (s, o, g) {\n\t\tvar a, i, k, x;\n\t\tvar optionKeys;\n\t\tvar newOptionObj = {};\n\n\t\tstate.reset();\n\n\t\tif (o && o.scope) {\n\t\t\tJSHINT.scope = o.scope;\n\t\t} else {\n\t\t\tJSHINT.errors = [];\n\t\t\tJSHINT.undefs = [];\n\t\t\tJSHINT.internals = [];\n\t\t\tJSHINT.blacklist = {};\n\t\t\tJSHINT.scope = \"(main)\";\n\t\t}\n\n\t\tpredefined = Object.create(null);\n\t\tcombine(predefined, vars.ecmaIdentifiers);\n\t\tcombine(predefined, vars.reservedVars);\n\n\t\tcombine(predefined, g || {});\n\n\t\tdeclared = Object.create(null);\n\t\texported = Object.create(null);\n\t\tignored = Object.create(null);\n\n\t\tif (o) {\n\t\t\ta = o.predef;\n\t\t\tif (a) {\n\t\t\t\tif (!Array.isArray(a) && typeof a === \"object\") {\n\t\t\t\t\ta = Object.keys(a);\n\t\t\t\t}\n\n\t\t\t\ta.forEach(function (item) {\n\t\t\t\t\tvar slice, prop;\n\n\t\t\t\t\tif (item[0] === \"-\") {\n\t\t\t\t\t\tslice = item.slice(1);\n\t\t\t\t\t\tJSHINT.blacklist[slice] = slice;\n\t\t\t\t\t} else {\n\t\t\t\t\t\tprop = Object.getOwnPropertyDescriptor(o.predef, item);\n\t\t\t\t\t\tpredefined[item] = prop ? prop.value : false;\n\t\t\t\t\t}\n\t\t\t\t});\n\t\t\t}\n\n\t\t\toptionKeys = Object.keys(o);\n\t\t\tfor (x = 0; x < optionKeys.length; x++) {\n\t\t\t\tif (/^-W\\d{3}$/g.test(optionKeys[x])) {\n\t\t\t\t\tignored[optionKeys[x].slice(1)] = true;\n\t\t\t\t} else {\n\t\t\t\t\tnewOptionObj[optionKeys[x]] = o[optionKeys[x]];\n\n\t\t\t\t\tif (optionKeys[x] === \"newcap\" && o[optionKeys[x]] === false)\n\t\t\t\t\t\tnewOptionObj[\"(explicitNewcap)\"] = true;\n\n\t\t\t\t\tif (optionKeys[x] === \"indent\")\n\t\t\t\t\t\tnewOptionObj[\"(explicitIndent)\"] = true;\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\n\t\tstate.option = newOptionObj;\n\n\t\tstate.option.indent = state.option.indent || 4;\n\t\tstate.option.maxerr = state.option.maxerr || 50;\n\n\t\tindent = 1;\n\t\tglobal = Object.create(predefined);\n\t\tscope = global;\n\t\tfunct = {\n\t\t\t\"(global)\":   true,\n\t\t\t\"(name)\":\t  \"(global)\",\n\t\t\t\"(scope)\":\t  scope,\n\t\t\t\"(breakage)\": 0,\n\t\t\t\"(loopage)\":  0,\n\t\t\t\"(tokens)\":   {},\n\t\t\t\"(metrics)\":   createMetrics(state.tokens.next)\n\t\t};\n\t\tfunctions = [funct];\n\t\turls = [];\n\t\tstack = null;\n\t\tmember = {};\n\t\tmembersOnly = null;\n\t\timplied = {};\n\t\tinblock = false;\n\t\tlookahead = [];\n\t\twarnings = 0;\n\t\tunuseds = [];\n\n\t\tif (!isString(s) && !Array.isArray(s)) {\n\t\t\terrorAt(\"E004\", 0);\n\t\t\treturn false;\n\t\t}\n\n\t\tif (isString(s) && /^\\s*$/g.test(s)) {\n\t\t\terrorAt(\"E005\", 0);\n\t\t\treturn false;\n\t\t}\n\n\t\tif (s.length === 0) {\n\t\t\terrorAt(\"E005\", 0);\n\t\t\treturn false;\n\t\t}\n\n\t\tvar api = {\n\t\t\tget isJSON() {\n\t\t\t\treturn state.jsonMode;\n\t\t\t},\n\n\t\t\tgetOption: function (name) {\n\t\t\t\treturn state.option[name] || null;\n\t\t\t},\n\n\t\t\tgetCache: function (name) {\n\t\t\t\treturn state.cache[name];\n\t\t\t},\n\n\t\t\tsetCache: function (name, value) {\n\t\t\t\tstate.cache[name] = value;\n\t\t\t},\n\n\t\t\twarn: function (code, data) {\n\t\t\t\twarningAt.apply(null, [ code, data.line, data.char ].concat(data.data));\n\t\t\t},\n\n\t\t\ton: function (names, listener) {\n\t\t\t\tnames.split(\" \").forEach(function (name) {\n\t\t\t\t\temitter.on(name, listener);\n\t\t\t\t}.bind(this));\n\t\t\t}\n\t\t};\n\n\t\temitter.removeAllListeners();\n\t\t(extraModules || []).forEach(function (func) {\n\t\t\tfunc(api);\n\t\t});\n\n\t\tstate.tokens.prev = state.tokens.curr = state.tokens.next = state.syntax[\"(begin)\"];\n\n\t\tlex = new Lexer(s);\n\n\t\tlex.on(\"warning\", function (ev) {\n\t\t\twarningAt.apply(null, [ ev.code, ev.line, ev.character].concat(ev.data));\n\t\t});\n\n\t\tlex.on(\"error\", function (ev) {\n\t\t\terrorAt.apply(null, [ ev.code, ev.line, ev.character ].concat(ev.data));\n\t\t});\n\n\t\tlex.on(\"fatal\", function (ev) {\n\t\t\tquit(\"E041\", ev.line, ev.from);\n\t\t});\n\n\t\tlex.on(\"Identifier\", function (ev) {\n\t\t\temitter.emit(\"Identifier\", ev);\n\t\t});\n\n\t\tlex.on(\"String\", function (ev) {\n\t\t\temitter.emit(\"String\", ev);\n\t\t});\n\n\t\tlex.on(\"Number\", function (ev) {\n\t\t\temitter.emit(\"Number\", ev);\n\t\t});\n\n\t\tlex.start();\n\n\t\t// Check options\n\t\tfor (var name in o) {\n\t\t\tif (_.has(o, name)) {\n\t\t\t\tcheckOption(name, state.tokens.curr);\n\t\t\t}\n\t\t}\n\n\t\tassume();\n\n\t\t// combine the passed globals after we've assumed all our options\n\t\tcombine(predefined, g || {});\n\n\t\t//reset values\n\t\tcomma.first = true;\n\n\t\ttry {\n\t\t\tadvance();\n\t\t\tswitch (state.tokens.next.id) {\n\t\t\tcase \"{\":\n\t\t\tcase \"[\":\n\t\t\t\tstate.option.laxbreak = true;\n\t\t\t\tstate.jsonMode = true;\n\t\t\t\tjsonValue();\n\t\t\t\tbreak;\n\t\t\tdefault:\n\t\t\t\tdirectives();\n\n\t\t\t\tif (state.directive[\"use strict\"]) {\n\t\t\t\t\tif (!state.option.globalstrict && !state.option.node) {\n\t\t\t\t\t\twarning(\"W097\", state.tokens.prev);\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\tstatements();\n\t\t\t}\n\t\t\tadvance((state.tokens.next && state.tokens.next.value !== \".\")\t? \"(end)\" : undefined);\n\n\t\t\tvar markDefined = function (name, context) {\n\t\t\t\tdo {\n\t\t\t\t\tif (typeof context[name] === \"string\") {\n\t\t\t\t\t\t// JSHINT marks unused variables as 'unused' and\n\t\t\t\t\t\t// unused function declaration as 'unction'. This\n\t\t\t\t\t\t// code changes such instances back 'var' and\n\t\t\t\t\t\t// 'closure' so that the code in JSHINT.data()\n\t\t\t\t\t\t// doesn't think they're unused.\n\n\t\t\t\t\t\tif (context[name] === \"unused\")\n\t\t\t\t\t\t\tcontext[name] = \"var\";\n\t\t\t\t\t\telse if (context[name] === \"unction\")\n\t\t\t\t\t\t\tcontext[name] = \"closure\";\n\n\t\t\t\t\t\treturn true;\n\t\t\t\t\t}\n\n\t\t\t\t\tcontext = context[\"(context)\"];\n\t\t\t\t} while (context);\n\n\t\t\t\treturn false;\n\t\t\t};\n\n\t\t\tvar clearImplied = function (name, line) {\n\t\t\t\tif (!implied[name])\n\t\t\t\t\treturn;\n\n\t\t\t\tvar newImplied = [];\n\t\t\t\tfor (var i = 0; i < implied[name].length; i += 1) {\n\t\t\t\t\tif (implied[name][i] !== line)\n\t\t\t\t\t\tnewImplied.push(implied[name][i]);\n\t\t\t\t}\n\n\t\t\t\tif (newImplied.length === 0)\n\t\t\t\t\tdelete implied[name];\n\t\t\t\telse\n\t\t\t\t\timplied[name] = newImplied;\n\t\t\t};\n\n\t\t\tvar warnUnused = function (name, tkn) {\n\t\t\t\tvar line = tkn.line;\n\t\t\t\tvar chr  = tkn.character;\n\n\t\t\t\tif (state.option.unused)\n\t\t\t\t\twarningAt(\"W098\", line, chr, name);\n\n\t\t\t\tunuseds.push({\n\t\t\t\t\tname: name,\n\t\t\t\t\tline: line,\n\t\t\t\t\tcharacter: chr\n\t\t\t\t});\n\t\t\t};\n\n\t\t\tvar checkUnused = function (func, key) {\n\t\t\t\tvar type = func[key];\n\t\t\t\tvar tkn = func[\"(tokens)\"][key];\n\n\t\t\t\tif (key.charAt(0) === \"(\")\n\t\t\t\t\treturn;\n\n\t\t\t\tif (type !== \"unused\" && type !== \"unction\")\n\t\t\t\t\treturn;\n\n\t\t\t\t// Params are checked separately from other variables.\n\t\t\t\tif (func[\"(params)\"] && func[\"(params)\"].indexOf(key) !== -1)\n\t\t\t\t\treturn;\n\n\t\t\t\t// Variable is in global scope and defined as exported.\n\t\t\t\tif (func[\"(global)\"] && _.has(exported, key)) {\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\twarnUnused(key, tkn);\n\t\t\t};\n\n\t\t\t// Check queued 'x is not defined' instances to see if they're still undefined.\n\t\t\tfor (i = 0; i < JSHINT.undefs.length; i += 1) {\n\t\t\t\tk = JSHINT.undefs[i].slice(0);\n\n\t\t\t\tif (markDefined(k[2].value, k[0])) {\n\t\t\t\t\tclearImplied(k[2].value, k[2].line);\n\t\t\t\t} else if (state.option.undef) {\n\t\t\t\t\twarning.apply(warning, k.slice(1));\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tfunctions.forEach(function (func) {\n\t\t\t\tif (func[\"(ignoreUnused)\"]) {\n\t\t\t\t\treturn;\n\t\t\t\t}\n\n\t\t\t\tfor (var key in func) {\n\t\t\t\t\tif (_.has(func, key)) {\n\t\t\t\t\t\tcheckUnused(func, key);\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\tif (!func[\"(params)\"])\n\t\t\t\t\treturn;\n\n\t\t\t\tvar params = func[\"(params)\"].slice();\n\t\t\t\tvar param  = params.pop();\n\t\t\t\tvar type;\n\n\t\t\t\twhile (param) {\n\t\t\t\t\ttype = func[param];\n\n\t\t\t\t\t// 'undefined' is a special case for (function (window, undefined) { ... })();\n\t\t\t\t\t// patterns.\n\n\t\t\t\t\tif (param === \"undefined\")\n\t\t\t\t\t\treturn;\n\n\t\t\t\t\tif (type !== \"unused\" && type !== \"unction\")\n\t\t\t\t\t\treturn;\n\n\t\t\t\t\twarnUnused(param, func[\"(tokens)\"][param]);\n\t\t\t\t\tparam = params.pop();\n\t\t\t\t}\n\t\t\t});\n\n\t\t\tfor (var key in declared) {\n\t\t\t\tif (_.has(declared, key) && !_.has(global, key)) {\n\t\t\t\t\twarnUnused(key, declared[key]);\n\t\t\t\t}\n\t\t\t}\n\t\t} catch (err) {\n\t\t\tif (err && err.name === \"JSHintError\") {\n\t\t\t\tvar nt = state.tokens.next || {};\n\t\t\t\tJSHINT.errors.push({\n\t\t\t\t\tscope     : \"(main)\",\n\t\t\t\t\traw       : err.raw,\n\t\t\t\t\treason    : err.message,\n\t\t\t\t\tline      : err.line || nt.line,\n\t\t\t\t\tcharacter : err.character || nt.from\n\t\t\t\t}, null);\n\t\t\t} else {\n\t\t\t\tthrow err;\n\t\t\t}\n\t\t}\n\n\t\t// Loop over the listed \"internals\", and check them as well.\n\n\t\tif (JSHINT.scope === \"(main)\") {\n\t\t\to = o || {};\n\n\t\t\tfor (i = 0; i < JSHINT.internals.length; i += 1) {\n\t\t\t\tk = JSHINT.internals[i];\n\t\t\t\to.scope = k.elem;\n\t\t\t\titself(k.value, o, g);\n\t\t\t}\n\t\t}\n\n\t\treturn JSHINT.errors.length === 0;\n\t};\n\n\t// Modules.\n\titself.addModule = function (func) {\n\t\textraModules.push(func);\n\t};\n\n\titself.addModule(style.register);\n\n\t// Data summary.\n\titself.data = function () {\n\t\tvar data = {\n\t\t\tfunctions: [],\n\t\t\toptions: state.option\n\t\t};\n\t\tvar implieds = [];\n\t\tvar members = [];\n\t\tvar fu, f, i, j, n, globals;\n\n\t\tif (itself.errors.length) {\n\t\t\tdata.errors = itself.errors;\n\t\t}\n\n\t\tif (state.jsonMode) {\n\t\t\tdata.json = true;\n\t\t}\n\n\t\tfor (n in implied) {\n\t\t\tif (_.has(implied, n)) {\n\t\t\t\timplieds.push({\n\t\t\t\t\tname: n,\n\t\t\t\t\tline: implied[n]\n\t\t\t\t});\n\t\t\t}\n\t\t}\n\n\t\tif (implieds.length > 0) {\n\t\t\tdata.implieds = implieds;\n\t\t}\n\n\t\tif (urls.length > 0) {\n\t\t\tdata.urls = urls;\n\t\t}\n\n\t\tglobals = Object.keys(scope);\n\t\tif (globals.length > 0) {\n\t\t\tdata.globals = globals;\n\t\t}\n\n\t\tfor (i = 1; i < functions.length; i += 1) {\n\t\t\tf = functions[i];\n\t\t\tfu = {};\n\n\t\t\tfor (j = 0; j < functionicity.length; j += 1) {\n\t\t\t\tfu[functionicity[j]] = [];\n\t\t\t}\n\n\t\t\tfor (j = 0; j < functionicity.length; j += 1) {\n\t\t\t\tif (fu[functionicity[j]].length === 0) {\n\t\t\t\t\tdelete fu[functionicity[j]];\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tfu.name = f[\"(name)\"];\n\t\t\tfu.param = f[\"(params)\"];\n\t\t\tfu.line = f[\"(line)\"];\n\t\t\tfu.character = f[\"(character)\"];\n\t\t\tfu.last = f[\"(last)\"];\n\t\t\tfu.lastcharacter = f[\"(lastcharacter)\"];\n\t\t\tdata.functions.push(fu);\n\t\t}\n\n\t\tif (unuseds.length > 0) {\n\t\t\tdata.unused = unuseds;\n\t\t}\n\n\t\tmembers = [];\n\t\tfor (n in member) {\n\t\t\tif (typeof member[n] === \"number\") {\n\t\t\t\tdata.member = member;\n\t\t\t\tbreak;\n\t\t\t}\n\t\t}\n\n\t\treturn data;\n\t};\n\n\titself.jshint = itself;\n\n\treturn itself;\n}());\n\n// Make JSHINT a Node module, if possible.\nif (typeof exports === \"object\" && exports) {\n\texports.JSHINT = JSHINT;\n}\n\n//@ sourceURL=/src/stable/jshint.js"
));
require("/src/stable/jshint.js");

JSHINT = require('/src/stable/jshint.js').JSHINT;})();

define("lib/jshint", function(){});

define('lib/globals',[],function(){

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
// TODO actually recognize syntax of TypeScript constructs

CodeMirror.defineMode("javascript", function(config, parserConfig) {
  var indentUnit = config.indentUnit;
  var jsonMode = parserConfig.json;
  var isTS = parserConfig.typescript;

  // Tokenizer

  var keywords = function(){
    function kw(type) {return {type: type, style: "keyword"};}
    var A = kw("keyword a"), B = kw("keyword b"), C = kw("keyword c");
    var operator = kw("operator"), atom = {type: "atom", style: "atom"};
    
    var jsKeywords = {
      "if": A, "while": A, "with": A, "else": B, "do": B, "try": B, "finally": B,
      "return": C, "break": C, "continue": C, "new": C, "delete": C, "throw": C,
      "var": kw("var"), "const": kw("var"), "let": kw("var"),
      "function": kw("function"), "catch": kw("catch"),
      "for": kw("for"), "switch": kw("switch"), "case": kw("case"), "default": kw("default"),
      "in": operator, "typeof": operator, "instanceof": operator,
      "true": atom, "false": atom, "null": atom, "undefined": atom, "NaN": atom, "Infinity": atom
    };

    // Extend the 'normal' keywords with the TypeScript language extensions
    if (isTS) {
      var type = {type: "variable", style: "variable-3"};
      var tsKeywords = {
        // object-like things
        "interface": kw("interface"),
        "class": kw("class"),
        "extends": kw("extends"),
        "constructor": kw("constructor"),

        // scope modifiers
        "public": kw("public"),
        "private": kw("private"),
        "protected": kw("protected"),
        "static": kw("static"),

        "super": kw("super"),

        // types
        "string": type, "number": type, "bool": type, "any": type
      };

      for (var attr in tsKeywords) {
        jsKeywords[attr] = tsKeywords[attr];
      }
    }

    return jsKeywords;
  }();

  var isOperatorChar = /[+\-*&%=<>!?|]/;

  function chain(stream, state, f) {
    state.tokenize = f;
    return f(stream, state);
  }

  function nextUntilUnescaped(stream, end) {
    var escaped = false, next;
    while ((next = stream.next()) != null) {
      if (next == end && !escaped)
        return false;
      escaped = !escaped && next == "\\";
    }
    return escaped;
  }

  // Used as scratch variables to communicate multiple values without
  // consing up tons of objects.
  var type, content;
  function ret(tp, style, cont) {
    type = tp; content = cont;
    return style;
  }

  function jsTokenBase(stream, state) {
    var ch = stream.next();
    if (ch == '"' || ch == "'")
      return chain(stream, state, jsTokenString(ch));
    else if (/[\[\]{}\(\),;\:\.]/.test(ch))
      return ret(ch);
    else if (ch == "0" && stream.eat(/x/i)) {
      stream.eatWhile(/[\da-f]/i);
      return ret("number", "number");
    }      
    else if (/\d/.test(ch) || ch == "-" && stream.eat(/\d/)) {
      stream.match(/^\d*(?:\.\d*)?(?:[eE][+\-]?\d+)?/);
      return ret("number", "number");
    }
    else if (ch == "/") {
      if (stream.eat("*")) {
        return chain(stream, state, jsTokenComment);
      }
      else if (stream.eat("/")) {
        stream.skipToEnd();
        return ret("comment", "comment");
      }
      else if (state.lastType == "operator" || state.lastType == "keyword c" ||
               /^[\[{}\(,;:]$/.test(state.lastType)) {
        nextUntilUnescaped(stream, "/");
        stream.eatWhile(/[gimy]/); // 'y' is "sticky" option in Mozilla
        return ret("regexp", "string-2");
      }
      else {
        stream.eatWhile(isOperatorChar);
        return ret("operator", null, stream.current());
      }
    }
    else if (ch == "#") {
      stream.skipToEnd();
      return ret("error", "error");
    }
    else if (isOperatorChar.test(ch)) {
      stream.eatWhile(isOperatorChar);
      return ret("operator", null, stream.current());
    }
    else {
      stream.eatWhile(/[\w\$_]/);
      var word = stream.current(), known = keywords.propertyIsEnumerable(word) && keywords[word];
      return (known && state.lastType != ".") ? ret(known.type, known.style, word) :
                     ret("variable", "variable", word);
    }
  }

  function jsTokenString(quote) {
    return function(stream, state) {
      if (!nextUntilUnescaped(stream, quote))
        state.tokenize = jsTokenBase;
      return ret("string", "string");
    };
  }

  function jsTokenComment(stream, state) {
    var maybeEnd = false, ch;
    while (ch = stream.next()) {
      if (ch == "/" && maybeEnd) {
        state.tokenize = jsTokenBase;
        break;
      }
      maybeEnd = (ch == "*");
    }
    return ret("comment", "comment");
  }

  // Parser

  var atomicTypes = {"atom": true, "number": true, "variable": true, "string": true, "regexp": true};

  function JSLexical(indented, column, type, align, prev, info) {
    this.indented = indented;
    this.column = column;
    this.type = type;
    this.prev = prev;
    this.info = info;
    if (align != null) this.align = align;
  }

  function inScope(state, varname) {
    for (var v = state.localVars; v; v = v.next)
      if (v.name == varname) return true;
  }

  function parseJS(state, style, type, content, stream) {
    var cc = state.cc;
    // Communicate our context to the combinators.
    // (Less wasteful than consing up a hundred closures on every call.)
    cx.state = state; cx.stream = stream; cx.marked = null, cx.cc = cc;
  
    if (!state.lexical.hasOwnProperty("align"))
      state.lexical.align = true;

    while(true) {
      var combinator = cc.length ? cc.pop() : jsonMode ? expression : statement;
      if (combinator(type, content)) {
        while(cc.length && cc[cc.length - 1].lex)
          cc.pop()();
        if (cx.marked) return cx.marked;
        if (type == "variable" && inScope(state, content)) return "variable-2";
        return style;
      }
    }
  }

  // Combinator utils

  var cx = {state: null, column: null, marked: null, cc: null};
  function pass() {
    for (var i = arguments.length - 1; i >= 0; i--) cx.cc.push(arguments[i]);
  }
  function cont() {
    pass.apply(null, arguments);
    return true;
  }
  function register(varname) {
    function inList(list) {
      for (var v = list; v; v = v.next)
        if (v.name == varname) return true;
      return false;
    }
    var state = cx.state;
    if (state.context) {
      cx.marked = "def";
      if (inList(state.localVars)) return;
      state.localVars = {name: varname, next: state.localVars};
    } else {
      if (inList(state.globalVars)) return;
      state.globalVars = {name: varname, next: state.globalVars};
    }
  }

  // Combinators

  var defaultVars = {name: "this", next: {name: "arguments"}};
  function pushcontext() {
    cx.state.context = {prev: cx.state.context, vars: cx.state.localVars};
    cx.state.localVars = defaultVars;
  }
  function popcontext() {
    cx.state.localVars = cx.state.context.vars;
    cx.state.context = cx.state.context.prev;
  }
  function pushlex(type, info) {
    var result = function() {
      var state = cx.state;
      state.lexical = new JSLexical(state.indented, cx.stream.column(), type, null, state.lexical, info);
    };
    result.lex = true;
    return result;
  }
  function poplex() {
    var state = cx.state;
    if (state.lexical.prev) {
      if (state.lexical.type == ")")
        state.indented = state.lexical.indented;
      state.lexical = state.lexical.prev;
    }
  }
  poplex.lex = true;

  function expect(wanted) {
    return function(type) {
      if (type == wanted) return cont();
      else if (wanted == ";") return pass();
      else return cont(arguments.callee);
    };
  }

  function statement(type) {
    if (type == "var") return cont(pushlex("vardef"), vardef1, expect(";"), poplex);
    if (type == "keyword a") return cont(pushlex("form"), expression, statement, poplex);
    if (type == "keyword b") return cont(pushlex("form"), statement, poplex);
    if (type == "{") return cont(pushlex("}"), block, poplex);
    if (type == ";") return cont();
    if (type == "function") return cont(functiondef);
    if (type == "for") return cont(pushlex("form"), expect("("), pushlex(")"), forspec1, expect(")"),
                                      poplex, statement, poplex);
    if (type == "variable") return cont(pushlex("stat"), maybelabel);
    if (type == "switch") return cont(pushlex("form"), expression, pushlex("}", "switch"), expect("{"),
                                         block, poplex, poplex);
    if (type == "case") return cont(expression, expect(":"));
    if (type == "default") return cont(expect(":"));
    if (type == "catch") return cont(pushlex("form"), pushcontext, expect("("), funarg, expect(")"),
                                        statement, poplex, popcontext);
    return pass(pushlex("stat"), expression, expect(";"), poplex);
  }
  function expression(type) {
    if (atomicTypes.hasOwnProperty(type)) return cont(maybeoperator);
    if (type == "function") return cont(functiondef);
    if (type == "keyword c") return cont(maybeexpression);
    if (type == "(") return cont(pushlex(")"), maybeexpression, expect(")"), poplex, maybeoperator);
    if (type == "operator") return cont(expression);
    if (type == "[") return cont(pushlex("]"), commasep(expression, "]"), poplex, maybeoperator);
    if (type == "{") return cont(pushlex("}"), commasep(objprop, "}"), poplex, maybeoperator);
    return cont();
  }
  function maybeexpression(type) {
    if (type.match(/[;\}\)\],]/)) return pass();
    return pass(expression);
  }
    
  function maybeoperator(type, value) {
    if (type == "operator") {
      if (/\+\+|--/.test(value)) return cont(maybeoperator);
      if (value == "?") return cont(expression, expect(":"), expression);
      return cont(expression);
    }
    if (type == ";") return;
    if (type == "(") return cont(pushlex(")"), commasep(expression, ")"), poplex, maybeoperator);
    if (type == ".") return cont(property, maybeoperator);
    if (type == "[") return cont(pushlex("]"), expression, expect("]"), poplex, maybeoperator);
  }
  function maybelabel(type) {
    if (type == ":") return cont(poplex, statement);
    return pass(maybeoperator, expect(";"), poplex);
  }
  function property(type) {
    if (type == "variable") {cx.marked = "property"; return cont();}
  }
  function objprop(type) {
    if (type == "variable") cx.marked = "property";
    else if (type == "number" || type == "string") cx.marked = type + " property";
    if (atomicTypes.hasOwnProperty(type)) return cont(expect(":"), expression);
  }
  function commasep(what, end) {
    function proceed(type) {
      if (type == ",") return cont(what, proceed);
      if (type == end) return cont();
      return cont(expect(end));
    }
    return function(type) {
      if (type == end) return cont();
      else return pass(what, proceed);
    };
  }
  function block(type) {
    if (type == "}") return cont();
    return pass(statement, block);
  }
  function maybetype(type) {
    if (type == ":") return cont(typedef);
    return pass();
  }
  function typedef(type) {
    if (type == "variable"){cx.marked = "variable-3"; return cont();}
    return pass();
  }
  function vardef1(type, value) {
    if (type == "variable") {
      register(value);
      return isTS ? cont(maybetype, vardef2) : cont(vardef2);
    }
    return pass();
  }
  function vardef2(type, value) {
    if (value == "=") return cont(expression, vardef2);
    if (type == ",") return cont(vardef1);
  }
  function forspec1(type) {
    if (type == "var") return cont(vardef1, expect(";"), forspec2);
    if (type == ";") return cont(forspec2);
    if (type == "variable") return cont(formaybein);
    return cont(forspec2);
  }
  function formaybein(_type, value) {
    if (value == "in") return cont(expression);
    return cont(maybeoperator, forspec2);
  }
  function forspec2(type, value) {
    if (type == ";") return cont(forspec3);
    if (value == "in") return cont(expression);
    return cont(expression, expect(";"), forspec3);
  }
  function forspec3(type) {
    if (type != ")") cont(expression);
  }
  function functiondef(type, value) {
    if (type == "variable") {register(value); return cont(functiondef);}
    if (type == "(") return cont(pushlex(")"), pushcontext, commasep(funarg, ")"), poplex, statement, popcontext);
  }
  function funarg(type, value) {
    if (type == "variable") {register(value); return isTS ? cont(maybetype) : cont();}
  }

  // Interface

  return {
    startState: function(basecolumn) {
      return {
        tokenize: jsTokenBase,
        lastType: null,
        cc: [],
        lexical: new JSLexical((basecolumn || 0) - indentUnit, 0, "block", false),
        localVars: parserConfig.localVars,
        globalVars: parserConfig.globalVars,
        context: parserConfig.localVars && {vars: parserConfig.localVars},
        indented: 0
      };
    },

    token: function(stream, state) {
      if (stream.sol()) {
        if (!state.lexical.hasOwnProperty("align"))
          state.lexical.align = false;
        state.indented = stream.indentation();
      }
      if (stream.eatSpace()) return null;
      var style = state.tokenize(stream, state);
      if (type == "comment") return style;
      state.lastType = type;
      return parseJS(state, style, type, content, stream);
    },

    indent: function(state, textAfter) {
      if (state.tokenize == jsTokenComment) return CodeMirror.Pass;
      if (state.tokenize != jsTokenBase) return 0;
      var firstChar = textAfter && textAfter.charAt(0), lexical = state.lexical;
      if (lexical.type == "stat" && firstChar == "}") lexical = lexical.prev;
      var type = lexical.type, closing = firstChar == type;
      if (type == "vardef") return lexical.indented + (state.lastType == "operator" || state.lastType == "," ? 4 : 0);
      else if (type == "form" && firstChar == "{") return lexical.indented;
      else if (type == "form") return lexical.indented + indentUnit;
      else if (type == "stat")
        return lexical.indented + (state.lastType == "operator" || state.lastType == "," ? indentUnit : 0);
      else if (lexical.info == "switch" && !closing)
        return lexical.indented + (/^(?:case|default)\b/.test(textAfter) ? indentUnit : 2 * indentUnit);
      else if (lexical.align) return lexical.column + (closing ? 0 : 1);
      else return lexical.indented + (closing ? 0 : indentUnit);
    },

    electricChars: ":{}",

    jsonMode: jsonMode
  };
});

CodeMirror.defineMIME("text/javascript", "javascript");
CodeMirror.defineMIME("text/ecmascript", "javascript");
CodeMirror.defineMIME("application/javascript", "javascript");
CodeMirror.defineMIME("application/ecmascript", "javascript");
CodeMirror.defineMIME("application/json", {name: "javascript", json: true});
CodeMirror.defineMIME("text/typescript", { name: "javascript", typescript: true });
CodeMirror.defineMIME("application/typescript", { name: "javascript", typescript: true });

define("lib/codemirror/mode/javascript/javascript", function(){});

(function() {
  var DEFAULT_BRACKETS = "()[]{}''\"\"";

  CodeMirror.defineOption("autoCloseBrackets", false, function(cm, val, old) {
    var wasOn = old && old != CodeMirror.Init;
    if (val && !wasOn)
      cm.addKeyMap(buildKeymap(typeof val == "string" ? val : DEFAULT_BRACKETS));
    else if (!val && wasOn)
      cm.removeKeyMap("autoCloseBrackets");
  });

  function buildKeymap(pairs) {
    var map = {name : "autoCloseBrackets"};
    for (var i = 0; i < pairs.length; i += 2) (function(left, right) {
      function maybeOverwrite(cm) {
        var cur = cm.getCursor(), ahead = cm.getRange(cur, CodeMirror.Pos(cur.line, cur.ch + 1));
        if (ahead != right) return CodeMirror.Pass;
        else cm.execCommand("goCharRight");
      }
      map["'" + left + "'"] = function(cm) {
        if (left == right && maybeOverwrite(cm) != CodeMirror.Pass) return;
        var cur = cm.getCursor("start"), ahead = CodeMirror.Pos(cur.line, cur.ch + 1);
        cm.replaceSelection(left + right, {head: ahead, anchor: ahead});
      };
      if (left != right) map["'" + right + "'"] = maybeOverwrite;
    })(pairs.charAt(i), pairs.charAt(i + 1));
    return map;
  }
})();

define("lib/codemirror/addon/edit/closebrackets", function(){});

(function() {
  var ie_lt8 = /MSIE \d/.test(navigator.userAgent) &&
    (document.documentMode == null || document.documentMode < 8);

  var Pos = CodeMirror.Pos;
  // Disable brace matching in long lines, since it'll cause hugely slow updates  
  var maxLineLen = 1000;

  var matching = {"(": ")>", ")": "(<", "[": "]>", "]": "[<", "{": "}>", "}": "{<"};
  function findMatchingBracket(cm) {
    var cur = cm.getCursor(), line = cm.getLineHandle(cur.line), pos = cur.ch - 1;
    var match = (pos >= 0 && matching[line.text.charAt(pos)]) || matching[line.text.charAt(++pos)];
    if (!match) return null;
    var forward = match.charAt(1) == ">", d = forward ? 1 : -1;
    var style = cm.getTokenAt(Pos(cur.line, pos + 1)).type;

    var stack = [line.text.charAt(pos)], re = /[(){}[\]]/;
    function scan(line, lineNo, start) {
      if (!line.text) return;
      var pos = forward ? 0 : line.text.length - 1, end = forward ? line.text.length : -1;
      if (start != null) pos = start + d;
      for (; pos != end; pos += d) {
        var ch = line.text.charAt(pos);
        if (re.test(ch) && cm.getTokenAt(Pos(lineNo, pos + 1)).type == style) {
          var match = matching[ch];
          if (match.charAt(1) == ">" == forward) stack.push(ch);
          else if (stack.pop() != match.charAt(0)) return {pos: pos, match: false};
          else if (!stack.length) return {pos: pos, match: true};
        }
      }
    }
    for (var i = cur.line, found, e = forward ? Math.min(i + 100, cm.lineCount()) : Math.max(-1, i - 100); i != e; i+=d) {
      if (i == cur.line) found = scan(line, i, pos);
      else found = scan(cm.getLineHandle(i), i);
      if (found) break;
    }
    return {from: Pos(cur.line, pos), to: found && Pos(i, found.pos), match: found && found.match};
  }

  function matchBrackets(cm, autoclear) {
    var found = findMatchingBracket(cm);
    if (!found || cm.getLine(found.from.line).length > maxLineLen ||
       found.to && cm.getLine(found.to.line).length > maxLineLen)
      return;

    var style = found.match ? "CodeMirror-matchingbracket" : "CodeMirror-nonmatchingbracket";
    var one = cm.markText(found.from, Pos(found.from.line, found.from.ch + 1), {className: style});
    var two = found.to && cm.markText(found.to, Pos(found.to.line, found.to.ch + 1), {className: style});
    // Kludge to work around the IE bug from issue #1193, where text
    // input stops going to the textare whever this fires.
    if (ie_lt8 && cm.state.focused) cm.display.input.focus();
    var clear = function() {
      cm.operation(function() { one.clear(); two && two.clear(); });
    };
    if (autoclear) setTimeout(clear, 800);
    else return clear;
  }

  var currentlyHighlighted = null;
  function doMatchBrackets(cm) {
    cm.operation(function() {
      if (currentlyHighlighted) {currentlyHighlighted(); currentlyHighlighted = null;}
      if (!cm.somethingSelected()) currentlyHighlighted = matchBrackets(cm, false);
    });
  }

  CodeMirror.defineOption("matchBrackets", false, function(cm, val) {
    if (val) cm.on("cursorActivity", doMatchBrackets);
    else cm.off("cursorActivity", doMatchBrackets);
  });

  CodeMirror.defineExtension("matchBrackets", function() {matchBrackets(this, true);});
  CodeMirror.defineExtension("findMatchingBracket", function(){return findMatchingBracket(this);});
})();

define("lib/codemirror/addon/edit/matchbrackets", function(){});

// Because sometimes you need to style the cursor's line.
//
// Adds an option 'styleActiveLine' which, when enabled, gives the
// active line's wrapping <div> the CSS class "CodeMirror-activeline",
// and gives its background <div> the class "CodeMirror-activeline-background".

(function() {
  
  var WRAP_CLASS = "CodeMirror-activeline";
  var BACK_CLASS = "CodeMirror-activeline-background";

  CodeMirror.defineOption("styleActiveLine", false, function(cm, val, old) {
    var prev = old && old != CodeMirror.Init;
    if (val && !prev) {
      updateActiveLine(cm);
      cm.on("cursorActivity", updateActiveLine);
    } else if (!val && prev) {
      cm.off("cursorActivity", updateActiveLine);
      clearActiveLine(cm);
      delete cm._activeLine;
    }
  });
  
  function clearActiveLine(cm) {
    if ("_activeLine" in cm) {
      cm.removeLineClass(cm._activeLine, "wrap", WRAP_CLASS);
      cm.removeLineClass(cm._activeLine, "background", BACK_CLASS);
    }
  }

  function updateActiveLine(cm) {
    var line = cm.getLineHandle(cm.getCursor().line);
    if (cm._activeLine == line) return;
    clearActiveLine(cm);
    cm.addLineClass(line, "wrap", WRAP_CLASS);
    cm.addLineClass(line, "background", BACK_CLASS);
    cm._activeLine = line;
  }
})();

define("lib/codemirror/addon/selection/active-line", function(){});

CodeMirror.validate = (function() {
  var GUTTER_ID = "CodeMirror-lint-markers";
  var SEVERITIES = /^(?:error|warning)$/;

  function showTooltip(e, content) {
    var tt = document.createElement("div");
    tt.className = "CodeMirror-lint-tooltip";
    tt.appendChild(content.cloneNode(true));
    document.body.appendChild(tt);

    function position(e) {
      if (!tt.parentNode) return CodeMirror.off(document, "mousemove", position);
      tt.style.top = (e.clientY - tt.offsetHeight - 5) + "px";
      tt.style.left = (e.clientX + 5) + "px";
    }
    CodeMirror.on(document, "mousemove", position);
    position(e);
    tt.style.opacity = 1;
    return tt;
  }
  function rm(elt) {
    if (elt.parentNode) elt.parentNode.removeChild(elt);
  }
  function hideTooltip(tt) {
    if (!tt.parentNode) return;
    if (tt.style.opacity == null) rm(tt);
    tt.style.opacity = 0;
    setTimeout(function() { rm(tt); }, 600);
  }

  function LintState(cm, options, hasGutter) {
    this.marked = [];
    this.options = options;
    this.timeout = null;
    this.hasGutter = hasGutter;
    this.onMouseOver = function(e) { onMouseOver(cm, e); };
  }

  function parseOptions(options) {
    if (options instanceof Function) return {getAnnotations: options};
    else if (!options || !options.getAnnotations) throw new Error("Required option 'getAnnotations' missing (lint addon)");
    return options;
  }

  function clearMarks(cm) {
    var state = cm._lintState;
    if (state.hasGutter) cm.clearGutter(GUTTER_ID);
    for (var i = 0; i < state.marked.length; ++i)
      state.marked[i].clear();
    state.marked.length = 0;
  }

  function makeMarker(labels, severity, multiple) {
    var marker = document.createElement("div"), inner = marker;
    marker.className = "CodeMirror-lint-marker-" + severity;
    if (multiple) {
      inner = marker.appendChild(document.createElement("div"));
      inner.className = "CodeMirror-lint-marker-multiple";
    }

    var tooltip;
    CodeMirror.on(inner, "mouseover", function(e) { tooltip = showTooltip(e, labels); });
    CodeMirror.on(inner, "mouseout", function() { if (tooltip) hideTooltip(tooltip); });

    return marker;
  }

  function getMaxSeverity(a, b) {
    if (a == "error") return a;
    else return b;
  }

  function groupByLine(annotations) {
    var lines = [];
    for (var i = 0; i < annotations.length; ++i) {
      var ann = annotations[i], line = ann.from.line;
      (lines[line] || (lines[line] = [])).push(ann);
    }
    return lines;
  }

  function annotationTooltip(ann) {
    var severity = ann.severity;
    if (!SEVERITIES.test(severity)) severity = "error";
    var tip = document.createElement("div");
    tip.className = "CodeMirror-lint-message-" + severity;
    tip.appendChild(document.createTextNode(ann.message));
    return tip;
  }

  function startLinting(cm) {
	  var state = cm._lintState, options = state.options;
	  if (options.async)
		  options.getAnnotations(cm, updateLinting, options);
	  else
		 updateLinting(cm, options.getAnnotations(cm.getValue()));
  }
  
  function updateLinting(cm, annotationsNotSorted) {
    clearMarks(cm);
    var state = cm._lintState, options = state.options;

    var annotations = groupByLine(annotationsNotSorted);

    for (var line = 0; line < annotations.length; ++line) {
      var anns = annotations[line];
      if (!anns) continue;

      var maxSeverity = null;
      var tipLabel = state.hasGutter && document.createDocumentFragment();

      for (var i = 0; i < anns.length; ++i) {
        var ann = anns[i];
        var severity = ann.severity;
        if (!SEVERITIES.test(severity)) severity = "error";
        maxSeverity = getMaxSeverity(maxSeverity, severity);

	if (options.formatAnnotation) ann = options.formatAnnotation(ann);
        if (state.hasGutter) tipLabel.appendChild(annotationTooltip(ann));

        if (ann.to) state.marked.push(cm.markText(ann.from, ann.to, {
          className: "CodeMirror-lint-span-" + severity,
          __annotation: ann
        }));
      }

      if (state.hasGutter)
        cm.setGutterMarker(line, GUTTER_ID, makeMarker(tipLabel, maxSeverity, anns.length > 1));
    }
  }

  function onChange(cm) {
    var state = cm._lintState;
    clearTimeout(state.timeout);
    state.timeout = setTimeout(function(){startLinting(cm);}, state.options.delay || 500);
  }

  function popupSpanTooltip(ann, e) {
    var tooltip = showTooltip(e, annotationTooltip(ann));
    var target = e.target || e.srcElement;
    CodeMirror.on(target, "mouseout", hide);
    function hide() {
      CodeMirror.off(target, "mouseout", hide);
      hideTooltip(tooltip);
    }
  }

  // When the mouseover fires, the cursor might not actually be over
  // the character itself yet. These pairs of x,y offsets are used to
  // probe a few nearby points when no suitable marked range is found.
  var nearby = [0, 0, 0, 5, 0, -5, 5, 0, -5, 0];

  function onMouseOver(cm, e) {
    if (!/\bCodeMirror-lint-span-/.test((e.target || e.srcElement).className)) return;
    for (var i = 0; i < nearby.length; i += 2) {
      var spans = cm.findMarksAt(cm.coordsChar({left: e.clientX + nearby[i],
                                                top: e.clientY + nearby[i + 1]}));
      for (var j = 0; j < spans.length; ++j) {
        var span = spans[j], ann = span.__annotation;
        if (ann) return popupSpanTooltip(ann, e);
      }
    }
  }

  CodeMirror.defineOption("lintWith", false, function(cm, val, old) {
    if (old && old != CodeMirror.Init) {
      clearMarks(cm);
      cm.off("change", onChange);
      CodeMirror.off(cm.getWrapperElement(), "mouseover", cm._lintState.onMouseOver);
      delete cm._lintState;
    }
    
    if (val) {
      var gutters = cm.getOption("gutters"), hasLintGutter = false;
      for (var i = 0; i < gutters.length; ++i) if (gutters[i] == GUTTER_ID) hasLintGutter = true;
      var state = cm._lintState = new LintState(cm, parseOptions(val), hasLintGutter);
      cm.on("change", onChange);
      CodeMirror.on(cm.getWrapperElement(), "mouseover", state.onMouseOver);
      startLinting(cm);
    }
  });
})();

define("lib/codemirror/addon/lint/lint", function(){});

(function() {

  var bogus = [ "Dangerous comment" ];

  var warnings = [ [ "Expected '{'",
		     "Statement body should be inside '{ }' braces." ] ];

  var errors = [ "Missing semicolon", "Extra comma", "Missing property name",
	         "Unmatched ", " and instead saw", " is not defined",
	         "Unclosed string", "Stopping, unable to continue" ];

  CodeMirror.javascriptValidator = function(text) {
    JSHINT(text);
    var errors = JSHINT.data().errors, result = [];
    if (errors) parseErrors(errors, result);
    return result;
  };

  function cleanup(error) {
    // All problems are warnings by default
    fixWith(error, warnings, "warning", true);
    fixWith(error, errors, "error");

    return isBogus(error) ? null : error;
  }

  function fixWith(error, fixes, severity, force) {
    var description, fix, find, replace, found;

    description = error.description;

    for ( var i = 0; i < fixes.length; i++) {
      fix = fixes[i];
      find = (typeof fix === "string" ? fix : fix[0]);
      replace = (typeof fix === "string" ? null : fix[1]);
      found = description.indexOf(find) !== -1;

      if (force || found) {
	error.severity = severity;
      }
      if (found && replace) {
	error.description = replace;
      }
    }
  }

  function isBogus(error) {
    var description = error.description;
    for ( var i = 0; i < bogus.length; i++) {
      if (description.indexOf(bogus[i]) !== -1) {
	return true;
      }
    }
    return false;
  }

  function parseErrors(errors, output) {
    for ( var i = 0; i < errors.length; i++) {
      var error = errors[i];
      if (error) {
	var linetabpositions, index;

	linetabpositions = [];

	// This next block is to fix a problem in jshint. Jshint
	// replaces
	// all tabs with spaces then performs some checks. The error
	// positions (character/space) are then reported incorrectly,
	// not taking the replacement step into account. Here we look
	// at the evidence line and try to adjust the character position
	// to the correct value.
	if (error.evidence) {
	  // Tab positions are computed once per line and cached
	  var tabpositions = linetabpositions[error.line];
	  if (!tabpositions) {
	    var evidence = error.evidence;
	    tabpositions = [];
	    // ugggh phantomjs does not like this
	    // forEachChar(evidence, function(item, index) {
	    Array.prototype.forEach.call(evidence, function(item,
							    index) {
	      if (item === '\t') {
		// First col is 1 (not 0) to match error
		// positions
		tabpositions.push(index + 1);
	      }
	    });
	    linetabpositions[error.line] = tabpositions;
	  }
	  if (tabpositions.length > 0) {
	    var pos = error.character;
	    tabpositions.forEach(function(tabposition) {
	      if (pos > tabposition) pos -= 1;
	    });
	    error.character = pos;
	  }
	}

	var start = error.character - 1, end = start + 1;
	if (error.evidence) {
	  index = error.evidence.substring(start).search(/.\b/);
	  if (index > -1) {
	    end += index;
	  }
	}

	// Convert to format expected by validation service
	error.description = error.reason;// + "(jshint)";
	error.start = error.character;
	error.end = end;
	error = cleanup(error);

	if (error)
          output.push({message: error.description,
                       severity: error.severity,
                       from: CodeMirror.Pos(error.line - 1, start),
                       to: CodeMirror.Pos(error.line - 1, end)});
      }
    }
  }
})();

define("lib/codemirror/addon/lint/javascript-lint", function(){});

require([
  'jquery',
  'bacon',
  'lib/createEditor',
  'lib/keymaster/keymaster.js',
  'lib/jshint',
  'lib/globals',
  'lib/codemirror/mode/javascript/javascript',
  'lib/codemirror/addon/edit/closebrackets',
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
  'Code': {
    mode: 'javascript',
    theme: 'neat',
    tabSize: 2,
    indentUnit: 2,
    indentWithTabs: false,
    lineNumbers: true,
    autoCloseBrackets: true,
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


$('#Reset').click(function(){
  window.context.clearRect(0, 0, window.canvas.width, window.canvas.height);
});


});
define("canvasSandbox", function(){});
