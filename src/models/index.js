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
User.hasMany(Job,   { foreignKey: 'UserId', as: 'jobs' });

Application.belongsTo(User, { foreignKey: 'userId', as: 'candidate' });
User.hasMany(Application,   { foreignKey: 'userId', as: 'applications' });

Application.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });
Job.hasMany(Application,   { foreignKey: 'jobId', as: 'applications' });

Favorite.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Favorite.belongsTo(Job,  { foreignKey: 'jobId',  as: 'job'  });

Notification.belongsTo(User, { foreignKey: 'userId' });

SavedSearch.belongsTo(User, { foreignKey: 'userId' });

module.exports = { User, Job, Resume, Application, Notification, Favorite, JobView, AiLog, SavedSearch };