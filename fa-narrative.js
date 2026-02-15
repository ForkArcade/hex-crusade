// FA Narrative Module v1
(function(window) {
  'use strict';

  if (!window.FA) window.FA = {};

  var _narrative = {
    currentNode: null,
    variables: {},
    graph: { nodes: [], edges: [] },

    init: function(config) {
      this.currentNode = config.startNode || null;
      this.variables = config.variables || {};
      this.graph = config.graph || { nodes: [], edges: [] };
      this._report();
    },

    transition: function(nodeId, event) {
      this.currentNode = nodeId;
      this._report(event);
    },

    setVar: function(name, value, reason) {
      this.variables[name] = value;
      this._report(reason || (name + ' = ' + value));
    },

    _report: function(event) {
      if (window.ForkArcade && window.ForkArcade.updateNarrative) {
        window.ForkArcade.updateNarrative({
          variables: this.variables,
          currentNode: this.currentNode,
          graph: this.graph,
          event: event
        });
      }
    }
  };

  window.FA.narrative = _narrative;
})(window);
