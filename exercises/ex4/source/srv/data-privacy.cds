using { cafe } from '../db/schema';

annotate cafe.CustomerFeedback with @PersonalData: {
  EntitySemantics: 'DataSubjectDetails'
} {
  comment    @PersonalData.IsPotentiallyPersonal;
  resolution @PersonalData.IsPotentiallyPersonal;
};

annotate cafe.Orders with @PersonalData: {
  EntitySemantics: 'DataSubjectDetails'
};
