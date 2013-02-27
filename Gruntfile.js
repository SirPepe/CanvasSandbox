module.exports = function(grunt){

grunt.initConfig({

pkg: grunt.file.readJSON('package.json'),

requirejs: {
  all: {
    options: {
      baseUrl: 'src/script',
      paths: {
        almond: 'lib/almond/almond',
        jquery: 'lib/jquery/jquery',
        keymaster: 'lib/keymaster/keymaster'
      },
      name: 'canvasSandbox',
      out: 'canvasSandbox.js',
      optimize: 'uglify'
    }
  }
},

cssmin: {
  compress: {
    files: {
      'canvasSandbox.css': [
        'src/script/lib/codemirror/lib/codemirror.css',
        'src/script/lib/codemirror/theme/neat.css',
        'src/style/canvasSandbox.css'
      ]
    }
  }
}

});

grunt.loadNpmTasks('grunt-contrib');

grunt.registerTask('default', ['requirejs', 'cssmin']);

};