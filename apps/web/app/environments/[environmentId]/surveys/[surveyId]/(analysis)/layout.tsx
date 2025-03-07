import { Metadata } from "next";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { getServerSession } from "next-auth";
import { getAnalysisData } from "@/app/environments/[environmentId]/surveys/[surveyId]/(analysis)/data";

type Props = {
  params: { surveyId: string; environmentId: string };
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const session = await getServerSession(authOptions);

  if (session) {
    const { responsesCount } = await getAnalysisData(params.surveyId, params.environmentId);
    return {
      title: `${responsesCount} Responses`,
    };
  }
  return {
    title: "",
  };
};

const SurveyLayout = ({ children }) => {
  return <div>{children}</div>;
};

export default SurveyLayout;
