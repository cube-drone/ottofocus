
Indices = new Meteor.Collection("indices");
Tasks = new Meteor.Collection("tasks");
CompletedTasks = new Meteor.Collection("completed_tasks");

if (Meteor.is_client) {
  
  Meteor.subscribe("tasks");
  Meteor.subscribe("indices");
  Meteor.subscribe("completed_tasks");
  
  var reset = function() {
    Tasks.update({'userId':Meteor.user()._id}, {$set: {'status':'OPEN'}}, {'multi':true} );
    setIndex(0);
  }

  var firstTask = function(){
    return Tasks.findOne({}, {'sort':{'order':1} } );
  }

  var getIndex = function() {
    var indices = Indices.findOne({});
    if( indices ){
      return indices.index;
    }
    else {
      return 0;
    }
  }

  var setIndex = function( index ){ 
    var max_index = maxIndex();
    if( index > max_index) { index = max_index; }
    if(Indices.find().count() == 0){
      Indices.insert({'userId':Meteor.user()._id, 'index':index});
    }
    else{
      Indices.update({'userId':Meteor.user()._id}, { $set: {'index':index}}); 
    }
  }

  var maxIndex = function(){
    var last_task = lastTask();
    if( last_task === undefined ) { return 0; } 
    return lastTask().order;
  }
  
  var allTasks = function() {
    return Tasks.find({}, {'sort':{'order':1} } );
  };

  var currentTask = function() { 
    var i = getIndex();
    var task = allTasks().fetch()[ i ];
    return task;
  };
  
  var nextTask = function() { 
    var i = getIndex();
    if( i+1 > maxIndex() ){ return currentTask(); }
    var task = allTasks().fetch()[ (i+1) ];
    if( task === undefined ){
      console.error( "Assertion Error: nextTask should always return a task." );
      console.error( "No item at i: " + (i+1) );
    }
    return task;
  };

  var lastTask = function() {
    return Tasks.findOne({}, {'sort':{'order':-1} } );
  };

  var setStatus = function( task_id, ss ) {
    Tasks.update( {
      'userId': Meteor.user()._id,
      '_id': task_id
      }, 
      { $set: { 'status': ss } 
    });
  };

  var setOrder = function( task_id, order ) {
    Tasks.update( {
      'userId': Meteor.user()._id,
      '_id': task_id
      }, 
      { $set: { 'order': order } 
    });
  }

  var checkForClosedTasks = function () {
    // if there are no CLOSED or REVIEW tasks, set all OPEN tasks to CLOSED tasks
    if( Tasks.find({ $or:[{'status':'CLOSED'}, {'status':'REVIEW'}] }).count() === 0 )
    {
      Tasks.update({'userId': Meteor.user()._id, 'status':'OPEN'}, { $set: {'status':'CLOSED'} }, {'multi':true} );
    }
  }

  var reOrder = function() {
    tasks = allTasks().fetch();
    for( var i = 0; i < allTasks().count(); i++ ){
      setOrder( tasks[i]._id, i );
    }
  }

  var clearDeletedRecords = function() {
    Tasks.remove({'userId':Meteor.user()._id, 'status':'DELETED'});
    reOrder();
  }

  var advanceIndex = function () {
      task = currentTask();
      next = nextTask();

      var lastTask = task._id === next._id;
      
      if( task.status == "CLOSED" && next.status == "OPEN" || task.status == "CLOSED" && lastTask ){
        if( Tasks.find( {'status':'DELETED'} ).count() === 0 )
        {
          // if all of the 'CLOSED' tasks have been skipped, set all of them to "REVIEW"
          Tasks.update( {'userId':Meteor.user()._id, 'status':'CLOSED'}, { $set: {'status':'REVIEW'} }, {'multi':true});
        }
        else
        {
          lastTask = true;
        }
      }
     
      if( lastTask ){
        setIndex( firstTask().order );
        clearDeletedRecords();
      }
      else{
        setIndex( getIndex() + 1 );
      }

      return;
    }

  var sanityCheck = function( ) {
    if( currentTask() && currentTask().status === "DELETED" )
    {
      advanceIndex();
    }
  }

  var skipCurrent = function( ) {
    checkForClosedTasks();
    advanceIndex();
    sanityCheck();
  }

  var deleteCurrent = function( ) {
    task = currentTask();
    next = nextTask();

    var lastTask = task._id === next._id;

    checkForClosedTasks();
    advanceIndex();
    setStatus( task._id, "DELETED" );

    if( lastTask ){ clearDeletedRecords(); } 
    sanityCheck();
  }

  var workedOnCurrent = function( ) {
    task = currentTask();
    deleteCurrent();

    var order = 0;
    if( Tasks.find().count() > 0 ){ 
      order = lastTask().order + 1;
    }

    var id = Tasks.insert( {
      'userId': Meteor.user()._id, 
      'order': order,
      'description': task.description, 
      'status': "OPEN",
    }); 
    sanityCheck();
  }
  
  var completeCurrent = function( ) {
    task = currentTask();
    deleteCurrent();

    var id = CompletedTasks.insert( {
      'userId': Meteor.user()._id, 
      'completed': Date.now(),
      'description': task.description, 
    }); 
  }
  
  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });

  Template.current_task.task = currentTask;
  Template.current_task.isReview = function() {
    var task = currentTask();
    if(task && task.status === "REVIEW"){ return true; }
    return false;
  }
  
  Template.last_task.task = lastTask;
  Template.all_tasks.tasks = allTasks;


  Template.all_completed_tasks.completed_tasks = function() {
    return CompletedTasks.find({});
  }

  Template.current_task.events = {
    'click button.skip': skipCurrent,   
    'click button.delete': deleteCurrent,
    'click button.done': completeCurrent,
    'click button.worked_on': workedOnCurrent,
  }

  var onEnter = function( fn ){
    return function( e ){
      if( e.keyCode == 13)
      {
        fn();
      }
    }
  }

  var newTask = function() {
      var new_task_description = $("#new_task").val();
      $("#new_task").val("");

      var order = 0;
      if( Tasks.find().count() > 0 ){ 
        order = lastTask().order + 1;
      }

      if( new_task_description === ""){ return; }
      // 'status' is one of OPEN, CLOSED, REVIEW, DELETED
      var id = Tasks.insert( {
        'userId': Meteor.user()._id, 
        'order': order,
        'description': new_task_description, 
        'status': "OPEN",
      }); 
  }

  Template.new_task.other_tasks = function() {
    return Tasks.find().count() > 0;
  }
  Template.new_task.events = {
    'keyup input.new_task': onEnter(newTask), 
    'click button.ok': newTask
  };

  Template.task_history.other_tasks = function() {
    return Tasks.find().count() > 0;
  }

  Template.task_history.completed_tasks = function() {
    return CompletedTasks.find().count() > 0;
  } 

  Template.task_history.both = function(){
    return Tasks.find().count() > 0 && CompletedTasks.find().count() > 0;
  }

  Template.task_list.selected = function(){
    var that = this;
    if (this && this._id && this._id && currentTask() && this._id === currentTask()._id ){ return true; }
    return false;
  }

}

if (Meteor.is_server) {
  
  Tasks.allow({ 
    insert: function(userId, task) { 
      return userId && task.userId === userId;
    },
    update: function(userId, tasks, fields, modifier) {
      return _.all(tasks, function(task){
          if( userId !== task.userId ){ return false; }
          return true;
      });
    },
    remove: function(userId, tasks){
      return _.all(tasks, function(task){
          if( userId !== task.userId ){ return false; }
          return true;
      });
    }
  });

  Meteor.publish("tasks", function() {
    return Tasks.find({userId: this.userId});
  });
  
  CompletedTasks.allow({ 
    insert: function(userId, task) { 
      return userId && task.userId === userId;
    },
    update: function(userId, tasks, fields, modifier) {
      return _.all(tasks, function(task){
          if( userId !== task.userId ){ return false; }
          return true;
      });
    },
    remove: function(userId, tasks){
      return _.all(tasks, function(task){
          if( userId !== task.userId ){ return false; }
          return true;
      });
    }
  });

  Meteor.publish("completed_tasks", function() {
    return CompletedTasks.find({userId: this.userId});
  });
  
  Indices.allow({ 
    insert: function(userId, index) { 
      return userId && index.userId === userId;
    },
    update: function(userId, indices, fields, modifier) {
      return _.all(indices, function(index){
          if( userId !== index.userId ){ return false; }
          return true;
      });
    },
    remove: function(userId, indices){
      return _.all(indices, function(index){
          if( userId !== index.userId ){ return false; }
          return true;
      });
    }
  });

  Meteor.publish("indices", function() {
    return Indices.find({userId: this.userId});
  });


  Meteor.startup(function () {
    // code to run on server at startup
  });
}
