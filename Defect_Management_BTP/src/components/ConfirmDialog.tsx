import {
  Dialog,
  Button,
  Icon,
  FlexBox
} from '@ui5/webcomponents-react';

import { useTranslation } from 'react-i18next';
import './ConfirmDialog.css';

interface AlertDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel: string;
  bodyKey: string | { key: string; values?: Record<string, any> };
  showCancel?: boolean;
  type?: 'alert' | 'information' | 'error' | 'success'; // ✅ 추가
}

const AlertDialog = ({
  open,
  onConfirm,
  onCancel,
  confirmLabel,
  bodyKey,
  showCancel = true,
  type = 'alert', // 기본값은 alert
}: AlertDialogProps) => {
  const { t } = useTranslation();

  // ✅ type에 따른 아이콘 매핑
  const iconMap: Record<string, string> = {
    alert: 'alert',
    information: 'information',
    error: 'error',
    success: 'success',
  };

  const iconName = iconMap[type] || 'alert';

  return (
    <Dialog
      open={open}
      header={
        <div className="global_message">
          <Icon name={iconName} className="global_message_header_icon" />
          <div className="global_message_header_text">{t(type)}</div>
        </div>
      }
      footer={
        <FlexBox
          fitContainer
          justifyContent="End"
          className="global_button_container"
        >
          <Button className="global_button global_button_emphasized" onClick={onConfirm}>
            {t(confirmLabel)}
          </Button>
          {showCancel && (
            <Button className="global_button global_button_transparent" onClick={onCancel}>
              {t('cancel')}
            </Button>
          )}
        </FlexBox>
      }
    >
      <div className="global_message_body">
        {typeof bodyKey === 'string'
          ? t(bodyKey)
          : t(bodyKey.key, bodyKey.values)
        }
      </div>
    </Dialog>
  );
};

export default AlertDialog;
