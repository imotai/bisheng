import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Constants, EModelEndpoint } from '~/data-provider/data-provider/src';
import { useGetModelsQuery } from '~/data-provider/data-provider/src/react-query';
import type { TPreset } from '~/data-provider/data-provider/src';
import {
  useGetConvoIdQuery,
  useHealthCheck,
  useGetEndpointsQuery,
  useGetStartupConfig,
  useGetBsConfig,
} from '~/data-provider';
import { useNewConvo, useAppStartup, useAssistantListMap } from '~/hooks';
import { getDefaultModelSpec, getModelSpecIconURL } from '~/utils';
import { ToolCallsMapProvider } from '~/Providers';
import ChatView from '~/components/Chat/ChatView';
import useAuthRedirect from './useAuthRedirect';
import temporaryStore from '~/store/temporary';
import { Spinner } from '~/components/svg';
import { useRecoilCallback } from 'recoil';
import store from '~/store';

export default function ChatRoute() {
  useHealthCheck();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: bsConfig } = useGetBsConfig()

  const { isAuthenticated, user } = useAuthRedirect();
  const setIsTemporary = useRecoilCallback(
    ({ set }) =>
      (value: boolean) => {
        set(temporaryStore.isTemporary, value);
      },
    [],
  );
  useAppStartup({ startupConfig, user });

  const index = 0;
  const { conversationId = '' } = useParams();

  const { hasSetConversation, conversation } = store.useCreateConversationAtom(index);
  const { newConversation } = useNewConvo();

  const modelsQuery = useGetModelsQuery({
    enabled: isAuthenticated,
    refetchOnMount: 'always',
  });
  const initialConvoQuery = useGetConvoIdQuery(conversationId, {
    enabled: isAuthenticated && conversationId !== Constants.NEW_CONVO,
  });
  const endpointsQuery = useGetEndpointsQuery({ enabled: isAuthenticated });
  const assistantListMap = useAssistantListMap();

  useEffect(() => {
    const shouldSetConvo =
      (startupConfig && !hasSetConversation.current && !modelsQuery.data?.initial) ?? false;
    /* Early exit if startupConfig is not loaded and conversation is already set and only initial models have loaded */
    if (!shouldSetConvo) {
      return;
    }

    if (conversationId === Constants.NEW_CONVO && endpointsQuery.data && modelsQuery.data) {
      const spec = getDefaultModelSpec(startupConfig?.modelSpecs?.list);

      newConversation({
        modelsData: modelsQuery.data,
        template: conversation ? conversation : undefined,
        ...(spec
          ? {
            preset: {
              ...spec.preset,
              iconURL: getModelSpecIconURL(spec),
              spec: spec.name,
            },
          }
          : {}),
      });

      hasSetConversation.current = true;
    } else if (initialConvoQuery.data && endpointsQuery.data && modelsQuery.data) {
      newConversation({
        template: initialConvoQuery.data,
        /* this is necessary to load all existing settings */
        preset: initialConvoQuery.data as TPreset,
        modelsData: modelsQuery.data,
        keepLatestMessage: true,
      });
      hasSetConversation.current = true;
    } else if (
      conversationId === Constants.NEW_CONVO &&
      assistantListMap[EModelEndpoint.assistants] &&
      assistantListMap[EModelEndpoint.azureAssistants]
    ) {
      const spec = getDefaultModelSpec(startupConfig?.modelSpecs?.list);
      newConversation({
        modelsData: modelsQuery.data,
        template: conversation ? conversation : undefined,
        ...(spec
          ? {
            preset: {
              ...spec.preset,
              iconURL: getModelSpecIconURL(spec),
              spec: spec.name,
            },
          }
          : {}),
      });
      hasSetConversation.current = true;
    } else if (
      assistantListMap[EModelEndpoint.assistants] &&
      assistantListMap[EModelEndpoint.azureAssistants]
    ) {
      newConversation({
        template: initialConvoQuery.data,
        preset: initialConvoQuery.data as TPreset,
        modelsData: modelsQuery.data,
        keepLatestMessage: true,
      });
      hasSetConversation.current = true;
    }
    /* Creates infinite render if all dependencies included due to newConversation invocations exceeding call stack before hasSetConversation.current becomes truthy */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startupConfig,
    initialConvoQuery.data,
    endpointsQuery.data,
    modelsQuery.data,
    assistantListMap,
  ]);

  if (endpointsQuery.isLoading || modelsQuery.isLoading) {
    return (
      <div aria-live="polite" role="status">
        <Spinner className="m-auto text-black dark:text-white" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // if not a conversation
  if (conversation?.conversationId === Constants.SEARCH) {
    return null;
  }
  // if conversationId not match
  if (conversation?.conversationId !== conversationId && !conversation) {
    return null;
  }
  // if conversationId is null
  if (!conversationId) {
    return null;
  }

  const isTemporaryChat = conversation && conversation.expiredAt ? true : false;

  if (conversationId !== Constants.NEW_CONVO && !isTemporaryChat) {
    setIsTemporary(false);
  } else if (isTemporaryChat) {
    setIsTemporary(isTemporaryChat);
  }

  return (
    <ToolCallsMapProvider conversationId={conversation.conversationId ?? ''}>
      {/* 对话面板入口 */}
      <ChatView index={index} />
    </ToolCallsMapProvider>
  );
}
