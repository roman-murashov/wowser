var ADT, Archive, BLP, DBC, DecodeStream, M2, PNG, Pipeline, Skin, attr, express, find, flatten;

attr = require('attr-accessor');

express = require('express');

find = require('array-find');

ADT = require('blizzardry/lib/adt');

Archive = require('./archive');

BLP = require('blizzardry/lib/blp');

DecodeStream = require('blizzardry/lib/restructure').DecodeStream;

DBC = require('blizzardry/lib/dbc/entities');

M2 = require('blizzardry/lib/m2');

PNG = require('pngjs').PNG;

Skin = require('blizzardry/lib/m2/skin');

flatten = function(array) {
  return array.reduce(function(a, b) {
    return a.concat(b);
  });
};

Pipeline = (function() {
  var DATA_DIR, get;

  module.exports = Pipeline;

  get = attr.accessors(Pipeline)[0];

  DATA_DIR = 'data';

  function Pipeline() {
    this.router = express();
    this.router.param('resource', this.resource.bind(this));
    this.router.get('/:resource(*.blp).png', this.blp.bind(this));
    this.router.get('/:resource(*.dbc)/:id(*)?.json', this.dbc.bind(this));
    this.router.get('/:resource(*.m2).3js', this.m2.bind(this));
    this.router.get('/:resource(*.adt).3js', this.adt.bind(this));
    this.router.get('/find/:query', this.find.bind(this));
    this.router.get('/:resource', this.serve.bind(this));
  }

  get({
    archive: function() {
      return this._archive || (this._archive = Archive.build(DATA_DIR));
    }
  });

  Pipeline.prototype.resource = function(req, res, next, path) {
    var err;
    req.resourcePath = path;
    if (req.resource = this.archive.files.get(path)) {
      return next();
    } else {
      err = new Error('resource not found');
      err.status = 404;
      throw err;
    }
  };

  Pipeline.prototype.blp = function(req, res) {
    return BLP.from(req.resource.data, function(blp) {
      var mipmap, png;
      mipmap = blp.largest;
      png = new PNG({
        width: mipmap.width,
        height: mipmap.height
      });
      png.data = mipmap.rgba;
      res.set('Content-Type', 'image/png');
      return png.pack().pipe(res);
    });
  };

  Pipeline.prototype.dbc = function(req, res) {
    var dbc, definition, entity, err, id, name;
    name = req.resourcePath.match(/(\w+)\.dbc/)[1];
    if (definition = DBC[name]) {
      dbc = definition.dbc.decode(new DecodeStream(req.resource.data));
      if (id = req.params[0]) {
        if (entity = find(dbc.records, function(entity) {
          return String(entity.id) === id;
        })) {
          return res.send(entity);
        } else {
          err = new Error('entity not found');
          err.status = 404;
          throw err;
        }
      } else {
        return res.send(dbc.records);
      }
    } else {
      err = new Error('entity definition not found');
      err.status = 404;
      throw err;
    }
  };

  Pipeline.prototype.skinFor = function(m2, req) {
    var path, quality, skin;
    quality = req.query.quality || 0;
    path = req.resourcePath.replace(/\.m2/i, "0" + quality + ".skin");
    if (skin = this.archive.files.get(path)) {
      return Skin.decode(new DecodeStream(skin.data));
    }
  };

  Pipeline.prototype.m2 = function(req, res) {
    var err, faces, m2, skin, uvs, vertices;
    m2 = M2.decode(new DecodeStream(req.resource.data));
    if (!(skin = this.skinFor(m2, req))) {
      err = new Error('skin not found for M2');
      err.status = 404;
      throw err;
    }
    vertices = m2.vertices.map(function(vertex) {
      return vertex.position;
    });
    faces = [];
    uvs = m2.vertices.map(function(vertex) {
      return vertex.textureCoords;
    });
    skin.triangles.forEach(function(vertices, index) {
      var face, i, _i, _len;
      face = [1 << 3];
      for (i = _i = 0, _len = vertices.length; _i < _len; i = ++_i) {
        index = vertices[i];
        face[1 + i] = skin.indices[index];
        face[1 + i + 3] = skin.indices[index];
      }
      return faces.push(face);
    });
    return res.send({
      vertices: flatten(vertices),
      faces: flatten(faces),
      uvs: [flatten(uvs)]
    });
  };

  Pipeline.prototype.adt = function(req, res) {
    var adt, chunk, cindex, coffset, cx, cy, faces, index, size, step, vertices, x, y, _i, _j, _k, _l;
    adt = ADT.decode(new DecodeStream(req.resource.data));
    size = 33.333333;
    step = size / 8;
    faces = [];
    vertices = [];
    for (cy = _i = 0; _i < 16; cy = ++_i) {
      for (cx = _j = 0; _j < 16; cx = ++_j) {
        cindex = cy * 16 + cx;
        chunk = adt.MCNKs[cindex];
        chunk.MCVT.heights.forEach(function(height, index) {
          var x, y;
          y = Math.floor(index / 17);
          x = index % 17;
          if (x > 8) {
            y += 0.5;
            x -= 8.5;
          }
          return vertices.push(cx * size + x * step, cy * size + y * step, chunk.position.z + height);
        });
        coffset = cindex * 145;
        index = coffset + 9;
        for (y = _k = 0; _k < 8; y = ++_k) {
          for (x = _l = 0; _l < 8; x = ++_l) {
            faces.push(0, index, index - 9, index - 8);
            faces.push(0, index, index - 8, index + 9);
            faces.push(0, index, index + 9, index + 8);
            faces.push(0, index, index + 8, index - 9);
            index++;
          }
          index += 9;
        }
      }
    }
    return res.send({
      vertices: vertices,
      faces: faces
    });
  };

  Pipeline.prototype.find = function(req, res) {
    return res.send(this.archive.files.find(req.params.query));
  };

  Pipeline.prototype.serve = function(req, res) {
    return res.send(req.resource.data);
  };

  return Pipeline;

})();