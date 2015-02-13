
var UTIL = require("modules/util");
var JSON = require("modules/json");

var Encoder = exports.Encoder = function() {
    if (!(this instanceof exports.Encoder))
        return new exports.Encoder();
    this.options = {
        "maxObjectDepth": 4,
        "maxArrayDepth": 4,
        "maxOverallDepth": 6,
        "includeLanguageMeta": true
    };
}

Encoder.prototype.setOption = function(name, value) {
    this.options[name] = value;
}

Encoder.prototype.setOrigin = function(variable) {
    this.origin = variable;
    // reset some variables
    this.instances = [];
    return true;
}

Encoder.prototype.encode = function(data, meta, options) {

    options = options || {};

    if(typeof data != "undefined") {
        this.setOrigin(data);
    }

    // TODO: Use meta["fc.encoder.options"] to control encoding

    var graph = {};
    
    try {
        if(typeof this.origin != "undefined") {
            graph["origin"] = this.encodeVariable(this.origin);
        }
    } catch(err) {
        console.warn("Error encoding variable", err.stack);
        throw err;
    }

    if(UTIL.len(this.instances)>0) {
        graph["instances"] = [];
        this.instances.forEach(function(instance) {
            graph["instances"].push(instance[1]);
        });
    }

    if(UTIL.has(options, "jsonEncode") && !options.jsonEncode) {
        return graph;
    }

    try {
        return JSON.encode(graph);
    } catch(e) {
        console.warn("Error jsonifying object graph" + e);
        throw e;
    }
    return null;
}

Encoder.prototype.encodeVariable = function(variable, objectDepth, arrayDepth, overallDepth) {
    objectDepth = objectDepth || 1;
    arrayDepth = arrayDepth || 1;
    overallDepth = overallDepth || 1;
    
    if(variable===null) {
        var ret = {"type": "constant", "constant": "null"};
        if(this.options["includeLanguageMeta"]) {
            ret["lang.type"] = "null";
        }
        return ret;
    } else
    if(variable===true || variable===false) {
        var ret = {"type": "constant", "constant": (variable===true)?"true":"false"};
        if(this.options["includeLanguageMeta"]) {
            ret["lang.type"] = "boolean";
        }
        return ret;
    }

    var type = typeof variable;
    if(type=="undefined") {
        var ret = {"type": "constant", "constant": "undefined"};
        if(this.options["includeLanguageMeta"]) {
            ret["lang.type"] = "undefined";
        }
        return ret;
    } else
    if(type=="number") {
        if(Math.round(variable)==variable) {
            var ret = {"type": "text", "text": ""+variable};
            if(this.options["includeLanguageMeta"]) {
                ret["lang.type"] = "integer";
            }
            return ret;
        } else {
            var ret = {"type": "text", "text": ""+variable};
            if(this.options["includeLanguageMeta"]) {
                ret["lang.type"] = "float";
            }
            return ret;
        }
    } else
    if(type=="string") {
        // HACK: This should be done via an option
        // FirePHPCore compatibility: Detect resource string
        if(variable=="** Excluded by Filter **") {
            var ret = {"type": "text", "text": variable};
            ret["encoder.notice"] = "Excluded by Filter";
            ret["encoder.trimmed"] = true;
            if(this.options["includeLanguageMeta"]) {
                ret["lang.type"] = "string";
            }
            return ret;
        } else
        if(variable.match(/^\*\*\sRecursion\s\([^\(]*\)\s\*\*$/)) {
            var ret = {"type": "text", "text": variable};
            ret["encoder.notice"] = "Recursion";
            ret["encoder.trimmed"] = true;
            if(this.options["includeLanguageMeta"]) {
                ret["lang.type"] = "string";
            }
            return ret;
        } else
        if(variable.match(/^\*\*\sResource\sid\s#\d*\s\*\*$/)) {
            var ret = {"type": "text", "text": variable.substring(3, variable.length-3)};
            if(this.options["includeLanguageMeta"]) {
                ret["lang.type"] = "resource";
            }
            return ret;
        } else {
            var ret = {"type": "text", "text": variable};
            if(this.options["includeLanguageMeta"]) {
                ret["lang.type"] = "string";
            }
            return ret;
        }
    }

    if (variable && variable.__no_serialize === true) {
        var ret = {"type": "text", "text": "Object"};
        ret["encoder.notice"] = "Excluded by __no_serialize";
        ret["encoder.trimmed"] = true;
        return ret;
    }

    if(type=="function") {
        var ret = {"type": "text", "text": ""+variable};
        if(this.options["includeLanguageMeta"]) {
            ret["lang.type"] = "function";
        }
        return ret;
    } else
    if(type=="object") {

        try {
            if(UTIL.isArrayLike(variable)) {
                var ret = {
                    "type": "array",
                    "array": this.encodeArray(variable, objectDepth, arrayDepth, overallDepth)
                };
                if(this.options["includeLanguageMeta"]) {
                    ret["lang.type"] = "array";
                }
                return ret;
            }
        } catch (err) {
// TODO: Find a better way to encode variables that cause security exceptions when accessed etc...
            var ret = {"type": "text", "text": "Cannot serialize"};
            ret["encoder.notice"] = "Cannot serialize";
            ret["encoder.trimmed"] = true;
            return ret;
        }
        // HACK: This should be done via an option
        // FirePHPCore compatibility: we only have an object if a class name is present

        if(typeof variable["__className"] != "undefined"  ) {
            var ret = {
                "type": "reference",
                "reference": this.encodeInstance(variable, objectDepth, arrayDepth, overallDepth)
            };
            return ret;
        } else {
            var ret;
            if (/^\[Exception\.\.\.\s/.test(variable)) {
                ret = {
                    "type": "map",
                    "map": this.encodeException(variable, objectDepth, arrayDepth, overallDepth)
                };
            } else {
                ret = {
                    "type": "map",
                    "map": this.encodeAssociativeArray(variable, objectDepth, arrayDepth, overallDepth)
                };
            }
            if(this.options["includeLanguageMeta"]) {
                ret["lang.type"] = "array";
            }
            return ret;
        }
    }

    var ret = {"type": "text", "text": "Variable with type '" + type + "' unknown: "+variable};
    if(this.options["includeLanguageMeta"]) {
        ret["lang.type"] = "unknown";
    }
    return ret;
//    return "["+(typeof variable)+"]["+variable+"]";    
}

Encoder.prototype.encodeArray = function(variable, objectDepth, arrayDepth, overallDepth) {
    objectDepth = objectDepth || 1;
    arrayDepth = arrayDepth || 1;
    overallDepth = overallDepth || 1;
    if(arrayDepth > this.options["maxArrayDepth"]) {
        return {"notice": "Max Array Depth (" + this.options["maxArrayDepth"] + ")"};
    } else
    if(overallDepth > this.options["maxOverallDepth"]) {
        return {"notice": "Max Overall Depth (" + this.options["maxOverallDepth"] + ")"};
    }
    var self = this,
        items = [];
    UTIL.forEach(variable, function(item) {
        items.push(self.encodeVariable(item, 1, arrayDepth + 1, overallDepth + 1));
    });
    return items;
}


Encoder.prototype.encodeAssociativeArray = function(variable, objectDepth, arrayDepth, overallDepth) {
    objectDepth = objectDepth || 1;
    arrayDepth = arrayDepth || 1;
    overallDepth = overallDepth || 1;
    if(arrayDepth > this.options["maxArrayDepth"]) {
        return {"notice": "Max Array Depth (" + this.options["maxArrayDepth"] + ")"};
    } else
    if(overallDepth > this.options["maxOverallDepth"]) {
        return {"notice": "Max Overall Depth (" + this.options["maxOverallDepth"] + ")"};
    }
    var self = this,
        items = [];
    for (var key in variable) {

        // HACK: This should be done via an option
        // FirePHPCore compatibility: numeric (integer) strings as keys in associative arrays get converted to integers
        // http://www.php.net/manual/en/language.types.array.php
        if(isNumber(key) && Math.round(key)==key) {
            key = parseInt(key);
        }
        
        items.push([
            self.encodeVariable(key, 1, arrayDepth + 1, overallDepth + 1),
            self.encodeVariable(variable[key], 1, arrayDepth + 1, overallDepth + 1)
        ]);
    }
    return items;
}


Encoder.prototype.encodeException = function(variable, objectDepth, arrayDepth, overallDepth) {
    var self = this,
        items = [];
    items.push([
        self.encodeVariable("message", 1, arrayDepth + 1, overallDepth + 1),
        self.encodeVariable((""+variable), 1, arrayDepth + 1, overallDepth + 1)
    ]);
    return items;
}

// http://stackoverflow.com/questions/18082/validate-numbers-in-javascript-isnumeric
function isNumber(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}



Encoder.prototype.getInstanceId = function(object) {
    for( var i=0 ; i<this.instances.length ; i++ ) {
        if(this.instances[i][0]===object) {
            return i;
        }
    }
    return null;
}

Encoder.prototype.encodeInstance = function(object, objectDepth, arrayDepth, overallDepth) {
    objectDepth = objectDepth || 1;
    arrayDepth = arrayDepth || 1;
    overallDepth = overallDepth || 1;
    var id = this.getInstanceId(object);
    if(id!=null) {
        return id;
    }
    this.instances.push([
        object,
        this.encodeObject(object, objectDepth, arrayDepth, overallDepth)
    ]);
    return UTIL.len(this.instances)-1;
}

Encoder.prototype.encodeObject = function(object, objectDepth, arrayDepth, overallDepth) {
    objectDepth = objectDepth || 1;
    arrayDepth = arrayDepth || 1;
    overallDepth = overallDepth || 1;

    if(arrayDepth > this.options["maxObjectDepth"]) {
        return {"notice": "Max Object Depth (" + this.options["maxObjectDepth"] + ")"};
    } else
    if(overallDepth > this.options["maxOverallDepth"]) {
        return {"notice": "Max Overall Depth (" + this.options["maxOverallDepth"] + ")"};
    }
    
    var self = this,
        ret = {"type": "dictionary", "dictionary": {}};

    // HACK: This should be done via an option
    // FirePHPCore compatibility: we have an object if a class name is present
    var isPHPClass = false;
    if(typeof object["__className"] != "undefined") {
        isPHPClass = true;
        ret["lang.class"] = object["__className"];
        delete(object["__className"]);
        if(this.options["includeLanguageMeta"]) {
            ret["lang.type"] = "object";
        }
    }

    // HACK: This should be done via an option
    // FirePHPCore compatibility: we have an exception if a class name is present
    if(typeof object["__isException"] != "undefined" && object["__isException"]) {
        ret["lang.type"] = "exception";
    }

    UTIL.forEach(object, function(item) {
        try {
            if(item[0]=="__fc_tpl_id") {
                ret['fc.tpl.id'] = item[1];
                return;
            }
            if(isPHPClass) {
                var val = self.encodeVariable(item[1], objectDepth + 1, 1, overallDepth + 1),
                    parts = item[0].split(":"),
                    name = parts[parts.length-1];
                if(parts[0]=="public") {
                    val["lang.visibility"] = "public";
                } else
                if(parts[0]=="protected") {
                    val["lang.visibility"] = "protected";
                } else
                if(parts[0]=="private") {
                    val["lang.visibility"] = "private";
                } else
                if(parts[0]=="undeclared") {
                    val["lang.undeclared"] = 1;
                }
                if(parts.length==2 && parts[1]=="static") {
                    val["lang.static"] = 1;
                }
                ret["dictionary"][name] = val;
            } else {
                ret["dictionary"][item[0]] = self.encodeVariable(item[1], objectDepth + 1, 1, overallDepth + 1);
            }
        } catch(e) {
            console.warn(e);
            ret["dictionary"]["__oops__"] = {"notice": "Error encoding member (" + e + ")"};
        }
    });
    
    return ret;
}