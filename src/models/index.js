const User         = require('./user');
const Job          = require('./Job');
const Resume       = require('./resume-model');
const Application  = require('./Application');
const Notification = require('./Notification');
const Favorite     = require('./Favorite');
const JobView      = require('./JobView');
const AiLog        = require('./AiLog');
const SavedSearch  = require('./SavedSearch');

Job.belongsTo(User, { foreignKey: 'UserId', as: 'owner' });
User.hasMany(Job,   { foreignKey: 'UserId', as: 'jobs', onDelete: 'CASCADE', hooks: true });

Application.belongsTo(User, { foreignKey: 'userId', as: 'candidate' });
User.hasMany(Application,   { foreignKey: 'userId', as: 'applications', onDelete: 'CASCADE', hooks: true });

Application.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });
Job.hasMany(Application,   { foreignKey: 'jobId', as: 'applications', onDelete: 'CASCADE', hooks: true });

Favorite.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Favorite.belongsTo(Job,  { foreignKey: 'jobId',  as: 'job'  });
User.hasMany(Favorite,   { foreignKey: 'userId', onDelete: 'CASCADE', hooks: true });
Job.hasMany(Favorite,    { foreignKey: 'jobId',  onDelete: 'CASCADE', hooks: true });

Job.hasMany(JobView,     { foreignKey: 'jobId',  onDelete: 'CASCADE', hooks: true });

Notification.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Notification,   { foreignKey: 'userId', onDelete: 'CASCADE', hooks: true });

SavedSearch.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(SavedSearch,    { foreignKey: 'userId', onDelete: 'CASCADE', hooks: true });

module.exports = { User, Job, Resume, Application, Notification, Favorite, JobView, AiLog, SavedSearch };