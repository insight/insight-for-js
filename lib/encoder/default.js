
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
            graph["origin"] = this.encodeVariable(meta, this.origin);
        }
    } catch(err) {
        console.warn("Error encoding variable", err.stack);
        throw err;
    }

    if(this.instances.length>0) {
        graph["instances"] = [];
        this.instances.forEach(function(instance) {
            graph["instances"].push(instance[1]);
        });
    }

    if(typeof options.jsonEncode !== 'undefined' && !options.jsonEncode) {
        return graph;
    }

    try {
        return JSON.stringify(graph);
    } catch(e) {
        console.warn("Error jsonifying object graph" + e);
        throw e;
    }
    return null;
}

function setMeta (node, name, value) {
    node.meta = node.meta || {};
    node.meta[name] = value;
}

function completeWithMeta (meta, node) {
    node.meta = node.meta || {};
    Object.keys(meta).forEach(function (name) {
        if (typeof node.meta[name] === 'undefined') {
            node.meta[name] = meta[name];
        }
    });
    return node;
}

Encoder.prototype.encodeVariable = function(meta, variable, objectDepth, arrayDepth, overallDepth) {
    objectDepth = objectDepth || 1;
    arrayDepth = arrayDepth || 1;
    overallDepth = overallDepth || 1;
    
    if(variable===null) {
        var ret = {"type": "constant", "value": "null"};
        if(this.options["includeLanguageMeta"]) {
            setMeta(ret, "lang.type", "null");
        }
        ret = completeWithMeta(meta, ret);
        return ret;
    } else
    if(variable===true || variable===false) {
        var ret = {"type": "constant", "value": (variable===true)?"true":"false"};
        if(this.options["includeLanguageMeta"]) {
            setMeta(ret, "lang.type", "boolean");
        }
        ret = completeWithMeta(meta, ret);
        return ret;
    }

    var type = typeof variable;
    if(type=="undefined") {
        var ret = {"type": "constant", "value": "undefined"};
        if(this.options["includeLanguageMeta"]) {
            setMeta(ret, "lang.type", "undefined");
        }
        completeWithMeta(meta, ret);
        return ret;
    } else
    if(type=="number") {
        if(Math.round(variable)==variable) {
            var ret = {"type": "string", "value": ""+variable};
            if(this.options["includeLanguageMeta"]) {
                setMeta(ret, "lang.type", "integer");
            }
            completeWithMeta(meta, ret);
            return ret;
        } else {
            var ret = {"type": "string", "value": ""+variable};
            if(this.options["includeLanguageMeta"]) {
                setMeta(ret, "lang.type", "float");
            }
            completeWithMeta(meta, ret);
            return ret;
        }
    } else
    if(type=="string") {
        // HACK: This should be done via an option
        // FirePHPCore compatibility: Detect resource string
        if(variable=="** Excluded by Filter **") {
            var ret = {"type": "string", "value": variable};
            setMeta(ret, "encoder.notice", "Excluded by Filter");
            setMeta(ret, "encoder.trimmed", true);
            if(this.options["includeLanguageMeta"]) {
                setMeta(ret, "lang.type", "string");
            }
            completeWithMeta(meta, ret);
            return ret;
        } else
        if(variable.match(/^\*\*\sRecursion\s\([^\(]*\)\s\*\*$/)) {
            var ret = {"type": "string", "value": variable};
            setMeta(ret, "encoder.notice", "Recursion");
            setMeta(ret, "encoder.trimmed", true);
            if(this.options["includeLanguageMeta"]) {
                setMeta(ret, "lang.type", "string");
            }
            completeWithMeta(meta, ret);
            return ret;
        } else
        if(variable.match(/^\*\*\sResource\sid\s#\d*\s\*\*$/)) {
            var ret = {"type": "string", "value": variable.substring(3, variable.length-3)};
            if(this.options["includeLanguageMeta"]) {
                setMeta(ret, "lang.type", "resource");
            }
            completeWithMeta(meta, ret);
            return ret;
        } else {
            var ret = {"type": "string", "value": variable};
            if(this.options["includeLanguageMeta"]) {
                setMeta(ret, "lang.type", "string");
            }
            completeWithMeta(meta, ret);
            return ret;
        }
    }

    if (variable && variable.__no_serialize === true) {
        var ret = {"type": "string", "value": "Object"};
        setMeta(ret, "encoder.notice", "Excluded by __no_serialize");
        setMeta(ret, "encoder.trimmed", true);
        completeWithMeta(meta, ret);
        return ret;
    }

    if(type=="function") {
        var ret = {"type": "string", "string": ""+variable};
        if(this.options["includeLanguageMeta"]) {
            setMeta(ret, "lang.type", "function");
        }
        completeWithMeta(meta, ret);
        return ret;
    } else
    if(type=="object") {

        try {
            if(Array.isArray(variable)) {
                var ret = {
                    "type": "array",
                    "value": this.encodeArray(meta, variable, objectDepth, arrayDepth, overallDepth)
                };
                if(this.options["includeLanguageMeta"]) {
                    setMeta(ret, "lang.type", "array");
                }
                ret = completeWithMeta(meta, ret);
                return ret;
            }
        } catch (err) {
// TODO: Find a better way to encode variables that cause security exceptions when accessed etc...
            var ret = {"type": "string", "string": "Cannot serialize"};
            setMeta(ret, "encoder.notice", "Cannot serialize");
            setMeta(ret, "encoder.trimmed", true);
            completeWithMeta(meta, ret);
            return ret;
        }
        // HACK: This should be done via an option
        // FirePHPCore compatibility: we only have an object if a class name is present

        if(typeof variable["__className"] != "undefined"  ) {
            var ret = {
                "type": "reference",
                "value": this.encodeInstance(meta, variable, objectDepth, arrayDepth, overallDepth)
            };
            completeWithMeta(meta, ret);
            return ret;
        } else {
            var ret;
            if (/^\[Exception\.\.\.\s/.test(variable)) {
                ret = {
                    "type": "map",
                    "value": this.encodeException(meta, variable, objectDepth, arrayDepth, overallDepth)
                };
            } else {
                ret = {
                    "type": "map",
                    "value": this.encodeAssociativeArray(meta, variable, objectDepth, arrayDepth, overallDepth)
                };
            }
            if(this.options["includeLanguageMeta"]) {
                setMeta(ret, "lang.type", "map");
            }
            completeWithMeta(meta, ret);
            return ret;
        }
    }

    var ret = {"type": "string", "value": "Variable with type '" + type + "' unknown: "+variable};
    if(this.options["includeLanguageMeta"]) {
        setMeta(ret, "lang.type", "unknown");
    }
    completeWithMeta(meta, ret);
    return ret;
//    return "["+(typeof variable)+"]["+variable+"]";    
}

Encoder.prototype.encodeArray = function(meta, variable, objectDepth, arrayDepth, overallDepth) {
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
    Object.keys(variable).forEach(function(name) {
        items.push(self.encodeVariable(meta, [name, variable[name]], 1, arrayDepth + 1, overallDepth + 1));
    });
    return items;
}


Encoder.prototype.encodeAssociativeArray = function(meta, variable, objectDepth, arrayDepth, overallDepth) {
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
            self.encodeVariable(meta, key, 1, arrayDepth + 1, overallDepth + 1),
            self.encodeVariable(meta, variable[key], 1, arrayDepth + 1, overallDepth + 1)
        ]);
    }
    return items;
}


Encoder.prototype.encodeException = function(meta, variable, objectDepth, arrayDepth, overallDepth) {
    var self = this,
        items = [];
    items.push([
        self.encodeVariable(meta, "message", 1, arrayDepth + 1, overallDepth + 1),
        self.encodeVariable(meta, (""+variable), 1, arrayDepth + 1, overallDepth + 1)
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

Encoder.prototype.encodeInstance = function(meta, object, objectDepth, arrayDepth, overallDepth) {
    objectDepth = objectDepth || 1;
    arrayDepth = arrayDepth || 1;
    overallDepth = overallDepth || 1;
    var id = this.getInstanceId(object);
    if(id!=null) {
        return id;
    }
    this.instances.push([
        object,
        this.encodeObject(meta, object, objectDepth, arrayDepth, overallDepth)
    ]);
    return this.instances.length-1;
}

Encoder.prototype.encodeObject = function(meta, object, objectDepth, arrayDepth, overallDepth) {
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
        ret = {"type": "dictionary", "value": {}};

    // HACK: This should be done via an option
    // FirePHPCore compatibility: we have an object if a class name is present
    var isPHPClass = false;
    if(typeof object["__className"] != "undefined") {
        isPHPClass = true;
        setMeta(ret, "lang.class", object["__className"]);
        delete(object["__className"]);
        if(this.options["includeLanguageMeta"]) {
            setMeta(ret, "lang.type", "object");
        }
    }

    // HACK: This should be done via an option
    // FirePHPCore compatibility: we have an exception if a class name is present
    if(typeof object["__isException"] != "undefined" && object["__isException"]) {
        setMeta(ret, "lang.type", "exception");
    }

    Object.keys(object).forEach(function(name) {
        var item = [name, object[name]];
        try {
            if(item[0]=="__fc_tpl_id") {
                ret['fc.tpl.id'] = item[1];
                return;
            }
            if(isPHPClass) {
                var val = self.encodeVariable(meta, item[1], objectDepth + 1, 1, overallDepth + 1),
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
                ret["value"][name] = val;
            } else {
                ret["value"][item[0]] = self.encodeVariable(meta, item[1], objectDepth + 1, 1, overallDepth + 1);
            }
        } catch(e) {
            console.warn(e);
            ret["value"]["__oops__"] = {"notice": "Error encoding member (" + e + ")"};
        }
    });

    completeWithMeta(meta, ret);

    return ret;
}