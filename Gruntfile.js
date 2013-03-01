module.exports = function(grunt){

grunt.initConfig({

pkg: grunt.file.readJSON('package.json'),

requirejs: {
  all: {
    options: {
      baseUrl: 'src/script',
      paths: {
        almond: 'lib/almond/almond',
        bacon: 'lib/bacon/dist/Bacon',
        jshint: 'lib/jshint',
        jquery: 'lib/jquery/jquery',
        codemirror: 'lib/codemirror/lib/codemirror',
        keymaster: 'lib/keymaster/keymaster'
      },
      name: 'almond',
      include: 'canvasSandbox',
      out: 'lib/canvasSandbox.js',
      optimize: 'none'
    }
  }
},

cssmin: {
  compress: {
    files: {
      'lib/canvasSandbox.css': [
        'src/script/lib/codemirror/lib/codemirror.css',
        'src/script/lib/codemirror/theme/neat.css',
        'src/script/lib/codemirror/addon/lint/lint.css',
        'src/style/canvasSandbox.css'
      ]
    }
  }
}

});

grunt.loadNpmTasks('grunt-contrib');

grunt.registerTask('default', ['requirejs', 'cssmin']);

};