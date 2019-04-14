
var UTIL = require("fp-modules-for-nodejs/lib/util"),
    JSON = require("fp-modules-for-nodejs/lib/json"),
    ENCODER = require("../encoder/default");

exports.EXTENDED = "EXTENDED";
exports.SIMPLE = "SIMPLE";


exports.generateFromMessage = function(message, format)
{
    format = format || exports.EXTENDED;

    var og = new ObjectGraph();

    var meta = {},
        data;

    if (typeof message.getMeta == "function")
    {
        meta = JSON.decode(message.getMeta() || "{}");
    }
    else
    if (typeof message.meta == "string")
    {
        meta = JSON.decode(message.meta);
    }
    else
    if (typeof message.meta == "object")
    {
        meta = message.meta;
    }

    if (typeof message.getData == "function")
    {
        data = message.getData();
    }
    else
    if (typeof message.data != "undefined")
    {
        data = message.data;
    }
    else
        throw new Error("NYI");

    if(meta["msg.preprocessor"] && meta["msg.preprocessor"]=="FirePHPCoreCompatibility") {

        var parts = convertFirePHPCoreData(meta, data);
        if (typeof message.setMeta == "function")
            message.setMeta(JSON.encode(parts[0]));
        else
            message.meta = JSON.encode(parts[0]);
        data = parts[1];

    } else
    if(typeof data !== "undefined" && data != "") {
        try {

            data = JSON.decode(data);

        } catch(e) {
            console.error("Error decoding JSON data: " + data);
            throw e;
        }
    } else {
        data = {};
    }

    // assign group title to value if applicable
    if(typeof meta["group.title"] != "undefined") {
        data = {
            "origin": {
                "type": "string",
                "string": meta["group.title"]
            }
        };
    }

    if(data.instances) {
        for( var i=0 ; i<data.instances.length ; i++ ) {
            data.instances[i] = generateNodesFromData(og, data.instances[i]);
        }
        og.setInstances(data.instances);
    }

    if(meta["lang.id"]) {
        og.setLanguageId(meta["lang.id"]);
    }

    og.setMeta(meta);

    if(UTIL.has(data, "origin")) {
        if(format==exports.EXTENDED) {
            og.setOrigin(generateNodesFromData(og, data.origin));
        } else
        if(format==exports.SIMPLE) {
            og.setOrigin(generateObjectsFromData(og, data.origin));
        } else {
            throw new Error("unsupported format: " + format);
        }
    }

    return og;
}

function generateObjectsFromData(objectGraph, data) {

    var node;

    if(data.type=="array") {
        node = [];
        for( var i=0 ; i<data[data.type].length ; i++ ) {
            node.push(generateObjectsFromData(objectGraph, data[data.type][i]));
        }
    } else
    if(data.type=="map") {
        node = [];
        for( var i=0 ; i<data[data.type].length ; i++ ) {
            node.push([
                generateObjectsFromData(objectGraph, data[data.type][i][0]),
                generateObjectsFromData(objectGraph, data[data.type][i][1])
            ]);
        }
    } else
    if(data.type=="dictionary") {
        node = {};
        for( var name in data[data.type] ) {
            node[name] = generateObjectsFromData(objectGraph, data[data.type][name]);
        }
    } else {
        node = data[data.type];
    }

    return node;
}


function generateNodesFromData(objectGraph, data, parentNode) {
    
    parentNode = parentNode || null;
    
    var node = new Node(objectGraph, data, parentNode);
    
    if(node.value!==null && typeof node.value != "undefined") {
        // some types need nested nodes decoded
        if(node.type=="array") {
            for( var i=0 ; i<node.value.length ; i++ ) {
                node.value[i] = generateNodesFromData(objectGraph, node.value[i], node);
            }
        } else
        if(node.type=="map") {
            for( var i=0 ; i<node.value.length ; i++ ) {
                node.value[i][0] = generateNodesFromData(objectGraph, node.value[i][0], node);
                node.value[i][1] = generateNodesFromData(objectGraph, node.value[i][1], node);
            }
        } else
        if(node.type=="dictionary") {
            for( var name in node.value ) {
                node.value[name] = generateNodesFromData(objectGraph, node.value[name], node);
            }
        }
    } else {
        node.value = null;
    }

    return node;
}



var Node = function(objectGraph, data, parentNode) {
    var self = this;
//    self.parentNode = parentNode || null;
    self.type = data.type;
    self.value = data[data.type];
    self.meta = objectGraph.meta || {};
    UTIL.every(data, function(item) {
        if(item[0]!="type" && item[0]!=self.type) {
            self.meta[item[0]] = item[1];
        }
    });
    if(self.type=="reference") {
        self.getInstance = function() {
            return objectGraph.getInstance(self.value);
        }
    }
//    self.getObjectGraph = function() {
//        return objectGraph;
//    }
}

Node.prototype.getTemplateId = function() {
    if(UTIL.has(this.meta, "tpl.id")) {
        return this.meta["tpl.id"];
    }
    return false;
}

Node.prototype.compact = function() {
    if(!this.compacted) {
        if(this.type=="map") {
            this.compacted = {};
            for( var i=0 ; i<this.value.length ; i++ ) {
                this.compacted[this.value[i][0].value] = this.value[i][1];
            }
        }
    }
    return this.compacted;
}
/*
Node.prototype.getPath = function(locateChild) {
    var path = [];
    if (this.parentNode)
        path = path.concat(this.parentNode.getPath(this));
    else
        path = path.concat(this.getObjectGraph().getPath(this));
    if (locateChild)
    {
        if(this.type=="map") {
            for( var i=0 ; i<this.value.length ; i++ ) {
                if (this.value[i][1] === locateChild)
                {
                    path.push("value[" + i + "][1]");
                    break;
                }
            }
        } else
        if(this.type=="dictionary") {
            for (var key in this.value)
            {
                if (this.value[key] === locateChild)
                {
                    path.push("value['" + key + "']");
                    break;
                }
            }
        } else
        if(this.type=="array") {
            for( var i=0 ; i<this.value.length ; i++ ) {
                if (this.value[i] === locateChild)
                {
                    path.push("value[" + i + "]");
                    break;
                }
            }
        } else {
console.error("NYI - getPath() for this.type = '" + this.type + "'", this);            
        }
    }
    return path;
}
*/
Node.prototype.forPath = function(path) {
    if (!path || path.length === 0)
        return this;
    if(this.type=="map") {
        var m = path[0].match(/^value\[(\d*)\]\[1\]$/);
        return this.value[parseInt(m[1])][1].forPath(path.slice(1));
    } else
    if(this.type=="dictionary") {
        var m = path[0].match(/^value\['(.*?)'\]$/);
        return this.value[m[1]].forPath(path.slice(1));
    } else
    if(this.type=="array") {
        var m = path[0].match(/^value\[(\d*)\]$/);
        return this.value[parseInt(m[1])].forPath(path.slice(1));
    } else {
//console.error("NYI - forPath('" + path + "') for this.type = '" + this.type + "'", this);            
    }
    return null;
}

//Node.prototype.renderIntoViewer = function(viewerDocument, options) {
//    throw new Error("NYI - Node.prototype.renderIntoViewer in " + module.id);
//    return RENDERER.renderIntoViewer(this, viewerDocument, options);
//}


var ObjectGraph = function() {
//    this.message = message;
}
//ObjectGraph.prototype = Object.create(new Node());

ObjectGraph.prototype.setOrigin = function(node) {
    this.origin = node;
}

ObjectGraph.prototype.getOrigin = function() {
    return this.origin;
}

ObjectGraph.prototype.setInstances = function(instances) {
    this.instances = instances;
}

ObjectGraph.prototype.getInstance = function(index) {
    return this.instances[index];
}

ObjectGraph.prototype.setLanguageId = function(id) {
    this.languageId = id;
}

ObjectGraph.prototype.getLanguageId = function() {
    return this.languageId;
}

ObjectGraph.prototype.setMeta = function(meta) {
    this.meta = meta;
}

ObjectGraph.prototype.getMeta = function() {
    return this.meta;
}
/*
ObjectGraph.prototype.getPath = function(locateChild) {
    if (this.origin === locateChild)
    {
        return ["origin"];
    }
    for( var i=0 ; i<this.instances.length ; i++ ) {
        if (this.instances[i] === locateChild)
        {
            return ["instances[" + i + "]"];
        }
    }
    throw new Error("Child node not found. We should never reach this!");
}
*/
ObjectGraph.prototype.nodeForPath = function(path) {
    var m = path[0].match(/^instances\[(\d*)\]$/);
    if (m) {
        return this.instances[parseInt(m[1])].forPath(path.slice(1));
    } else {
        // assume path[0] == 'origin'
        return this.origin.forPath(path.slice(1));
    }
    return node;
}


var encoder = ENCODER.Encoder();
encoder.setOption("maxObjectDepth", 1000);
encoder.setOption("maxArrayDepth", 1000);
encoder.setOption("maxOverallDepth", 1000);
function convertFirePHPCoreData(meta, data) {
    data = encoder.encode(JSON.decode(data), null, {
        "jsonEncode": false
    });
    return [meta, data]; 
}
