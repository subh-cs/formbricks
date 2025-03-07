import { prisma } from "@formbricks/database";
import { select } from "@formbricks/lib/services/survey";
import { TPerson } from "@formbricks/types/v1/people";
import { TSurvey } from "@formbricks/types/v1/surveys";

export const getSurveys = async (environmentId: string, person: TPerson): Promise<TSurvey[]> => {
  // get recontactDays from product
  const product = await prisma.product.findFirst({
    where: {
      environments: {
        some: {
          id: environmentId,
        },
      },
    },
    select: {
      recontactDays: true,
    },
  });

  if (!product) {
    throw new Error("Product not found");
  }
  // get all surveys that meet the displayOption criteria
  const potentialSurveys = await prisma.survey.findMany({
    where: {
      OR: [
        {
          environmentId,
          type: "web",
          status: "inProgress",
          displayOption: "respondMultiple",
        },
        {
          environmentId,
          type: "web",
          status: "inProgress",
          displayOption: "displayOnce",
          displays: { none: { personId: person.id } },
        },
        {
          environmentId,
          type: "web",
          status: "inProgress",
          displayOption: "displayMultiple",
          displays: { none: { personId: person.id, status: "responded" } },
        },
      ],
    },
    select: {
      ...select,
      attributeFilters: {
        select: {
          id: true,
          condition: true,
          value: true,
          attributeClass: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      displays: {
        where: {
          personId: person.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          createdAt: true,
        },
      },
    },
  });

  // get last display for this person
  const lastDisplayPerson = await prisma.display.findFirst({
    where: {
      personId: person.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      createdAt: true,
    },
  });

  // filter surveys that meet the attributeFilters criteria
  const potentialSurveysWithAttributes = potentialSurveys.filter((survey) => {
    const attributeFilters = survey.attributeFilters;
    if (attributeFilters.length === 0) {
      return true;
    }
    // check if meets all attribute filters criterias
    return attributeFilters.every((attributeFilter) => {
      const personAttributeValue = person.attributes[attributeFilter.attributeClass.name];
      if (attributeFilter.condition === "equals") {
        return personAttributeValue === attributeFilter.value;
      } else if (attributeFilter.condition === "notEquals") {
        return personAttributeValue !== attributeFilter.value;
      } else {
        throw Error("Invalid attribute filter condition");
      }
    });
  });

  // filter surveys that meet the recontactDays criteria
  const surveys: TSurvey[] = potentialSurveysWithAttributes
    .filter((survey) => {
      if (!lastDisplayPerson) {
        // no display yet - always display
        return true;
      } else if (survey.recontactDays !== null) {
        // if recontactDays is set on survey, use that
        const lastDisplaySurvey = survey.displays[0];
        if (!lastDisplaySurvey) {
          // no display yet - always display
          return true;
        }
        const lastDisplayDate = new Date(lastDisplaySurvey.createdAt);
        const currentDate = new Date();
        const diffTime = Math.abs(currentDate.getTime() - lastDisplayDate.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= survey.recontactDays;
      } else if (product.recontactDays !== null) {
        // if recontactDays is not set in survey, use product recontactDays
        const lastDisplayDate = new Date(lastDisplayPerson.createdAt);
        const currentDate = new Date();
        const diffTime = Math.abs(currentDate.getTime() - lastDisplayDate.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= product.recontactDays;
      } else {
        // if recontactDays is not set in survey or product, always display
        return true;
      }
    })
    .map((survey) => ({
      ...survey,
      triggers: survey.triggers.map((trigger) => trigger.eventClass),
      attributeFilters: survey.attributeFilters.map((af) => ({
        ...af,
        attributeClassId: af.attributeClass.id,
        attributeClass: undefined,
      })),
    }));

  return surveys;
};
